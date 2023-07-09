import * as Context from '@effect/data/Context'
import * as Option from '@effect/data/Option'
import * as Effect from '@effect/io/Effect'

import type { EffectfulBucket } from '@/bucket'
import { crawlBsky } from '@/crawler/bsky'
import type { KVClient } from '@/do/KV'

interface CrawlContext {
  FEED_BUCKET: EffectfulBucket
  kvClient: KVClient
  jobTimestamp: number
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
  const { FEED_BUCKET, jobTimestamp, kvClient } = yield* _(CrawlContext)

  const endTimestamp = yield* _(
    Effect.tryCatchPromise(
      (): Promise<number> => kvClient.get.query({ key: 'frontTimestamp' }),
      () => null,
    ),
    Effect.catchAll(() => Effect.succeed(null)),
    Effect.map(Option.fromNullable),
    Effect.map(Option.getOrElse(() => Date.now() - 1000 * 60 * 60 * 4)),
  )

  yield* _(Effect.logInfo(`Start crawling with endTimestamp: ${endTimestamp}`))

  const [bskyItems] = yield* _(
    Effect.allPar(crawlBsky),
    Effect.provideService(
      CrawlConfigContext,
      CrawlConfigContext.of({ endTimestamp }),
    ),
  )

  const items: CrawlItem[] = [...bskyItems]
  items.sort((a, b) => b.alignTimestamp - a.alignTimestamp)
  const itemsCount = items.length

  yield* _(
    Effect.logInfo(`Crawled ${itemsCount} items (bsky: ${bskyItems.length})`),
  )

  const chunks: CrawlItem[][] = []
  while (items.length) {
    chunks.push(items.splice(0, 10))
  }

  yield* _(
    chunks.map((chunk) =>
      FEED_BUCKET.put(
        `feed-items-${new Date(
          jobTimestamp,
        ).toISOString()}-chunk${chunks.indexOf(chunk)}.json`,
        JSON.stringify(chunk),
      ),
    ),
    Effect.allPar,
  )

  yield* _(
    Effect.logInfo(`Crawling finished, uploaded ${chunks.length} chunks`),
  )

  const frontTimestamp = chunks.at(0)?.at(0)?.alignTimestamp ?? endTimestamp

  yield* _(
    Effect.tryCatchPromise(
      () =>
        kvClient.set.mutate({ key: 'frontTimestamp', value: frontTimestamp }),
      () => undefined,
    ),
    Effect.catchAll(() => Effect.succeed(undefined)),
  )

  return {
    uploadedChunks: chunks.length,
    frontTimestamp,
    itemsCount: {
      all: itemsCount,
      bsky: bskyItems.length,
    },
  }
})
