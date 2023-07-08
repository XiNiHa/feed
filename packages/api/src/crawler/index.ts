import * as Context from '@effect/data/Context'
import * as Effect from '@effect/io/Effect'

import type { EffectfulBucket } from '@/bucket'
import { crawlBsky } from '@/crawler/bsky'

interface CrawlContext {
  FEED_BUCKET: EffectfulBucket
  cronTimestamp: number
}

export const CrawlContext = Context.Tag<CrawlContext>()

export interface CrawlItem {
  type: string
  alignTimestamp: number
}

interface CrawlConfigContext {
  endTimestamp: number
}

export const CrawlConfigContext = Context.Tag<CrawlConfigContext>()

export const crawl = Effect.gen(function* (_) {
  const { FEED_BUCKET, cronTimestamp } = yield* _(CrawlContext)

  const list = yield* _(
    FEED_BUCKET.list({
      prefix: 'feed-items-',
      limit: 1,
      include: ['customMetadata'],
    }),
  )
  const frontTimestamp = list.objects.at(0)?.customMetadata?.frontTimestamp
  const endTimestamp = frontTimestamp
    ? Number(frontTimestamp)
    : Date.now() - 1000 * 60 * 60 * 4

  yield* _(
    Effect.logInfo(
      `Start crawling with endTimestamp: ${endTimestamp} (${
        frontTimestamp ? 'front timestamp' : 'default timestamp'
      })`,
    ),
  )

  const [bskyItems] = yield* _(
    Effect.allPar(crawlBsky),
    Effect.provideService(
      CrawlConfigContext,
      CrawlConfigContext.of({ endTimestamp }),
    ),
  )

  const items: CrawlItem[] = [...bskyItems]
  items.sort((a, b) => b.alignTimestamp - a.alignTimestamp)

  yield* _(
    Effect.logInfo(`Crawled ${items.length} items (bsky: ${bskyItems.length})`),
  )

  const chunks: CrawlItem[][] = []
  while (items.length) {
    chunks.push(items.splice(0, 10))
  }

  yield* _(
    Effect.forEach([...chunks].reverse(), (chunk) =>
      FEED_BUCKET.put(
        `feed-items-${new Date(
          cronTimestamp,
        ).toISOString()}-chunk${chunks.indexOf(chunk)}.json`,
        JSON.stringify(chunk),
        {
          onlyIf: {},
          customMetadata: {
            frontTimestamp: String(chunk[0].alignTimestamp),
          },
        },
      ),
    ),
  )

  yield* _(
    Effect.logInfo(`Crawling finished, uploaded ${chunks.length} chunks`),
  )
})
