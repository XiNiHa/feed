import * as Context from '@effect/data/Context'
import { pipe } from '@effect/data/Function'
import * as Option from '@effect/data/Option'
import * as Effect from '@effect/io/Effect'
import { match } from 'ts-pattern'

import type { EffectfulBucket } from '@/bucket'
import { BskyCrawlContext, crawlBsky } from '@/crawler/bsky'
import { TwitterCrawlContext, crawlTwitter } from '@/crawler/twitter'
import type { KVClient } from '@/do/KV'

interface CrawlContext {
  FEED_BUCKET: EffectfulBucket
  kvClient: KVClient
  jobTimestamp: number
}

export const CrawlContext = Context.Tag<CrawlContext>()

export interface CrawlItem {
  sourceId: string
  type: string
  alignTimestamp: number
}

interface CrawlConfigContext {
  endTimestamp: number
}

export const CrawlConfigContext = Context.Tag<CrawlConfigContext>()

type Source = { id: string } & (
  | { type: 'bsky'; context: Context.Context<BskyCrawlContext> }
  | { type: 'twitter'; context: Context.Context<TwitterCrawlContext> }
)

export const crawl = (...sources: Source[]) =>
  Effect.gen(function* (_) {
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

    yield* _(
      Effect.logInfo(`Start crawling with endTimestamp: ${endTimestamp}`),
    )

    const sourceEffects = sources.map((source) =>
      pipe(
        match(source)
          .with({ type: 'bsky' }, (source) =>
            pipe(
              crawlBsky(source.id),
              Effect.provideService(
                BskyCrawlContext,
                Context.get(source.context, BskyCrawlContext),
              ),
            ),
          )
          .with({ type: 'twitter' }, (source) =>
            pipe(
              crawlTwitter(source.id),
              Effect.provideService(
                TwitterCrawlContext,
                Context.get(source.context, TwitterCrawlContext),
              ),
            ),
          )
          .exhaustive(),
        Effect.map((items: CrawlItem[]) => ({ sourceId: source.id, items })),
      ),
    )

    const sourceItems = yield* _(
      Effect.allPar(sourceEffects),
      Effect.provideService(
        CrawlConfigContext,
        CrawlConfigContext.of({ endTimestamp }),
      ),
    )
    const items = sourceItems.flatMap(({ items }) => items)
    items.sort((a, b) => b.alignTimestamp - a.alignTimestamp)
    const itemsCount = items.length

    yield* _(
      Effect.logInfo(
        `Crawled ${itemsCount} items (${sourceItems
          .map(({ sourceId, items }) => `${sourceId}: ${items.length}`)
          .join(', ')})`,
      ),
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
        perSources: sourceItems.map(({ sourceId, items }) => ({
          id: sourceId,
          count: items.length,
        })),
      },
    }
  })
