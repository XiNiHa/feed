import type { AppBskyFeedGetTimeline, BskyAgent } from '@atproto/api'
import * as Context from '@effect/data/Context'
import { pipe } from '@effect/data/Function'
import * as Effect from '@effect/io/Effect'

import { CrawlConfigContext, CrawlItem } from '@/crawler'

interface BskyCrawlContext {
  agent: BskyAgent
  account: {
    identifier: string
    password: string
  }
  maxCount: number
}

export const BskyCrawlContext = Context.Tag<BskyCrawlContext>()

export class BskyCrawlError extends Error {
  readonly _tag = 'BskyCrawlError'

  constructor(message: string, e: Error | null) {
    let formatted = `BskyCrawlError: ${message}`
    if (e) formatted += `, original error: ${e.message}`
    super(formatted)
  }
}

interface BskyCrawlItem extends CrawlItem {
  type: 'BskyCrawlItem'
  data: AppBskyFeedGetTimeline.OutputSchema['feed'][0]
}

export const crawlBsky = pipe(
  Effect.gen(function* (_) {
    const { agent, account, maxCount } = yield* _(BskyCrawlContext)
    const { endTimestamp } = yield* _(CrawlConfigContext)
    yield* _(
      Effect.tryCatchPromise(
        () =>
          agent.login({
            identifier: account.identifier,
            password: account.password,
          }),
        (e) =>
          new BskyCrawlError('failed to login', e instanceof Error ? e : null),
      ),
      Effect.tap(({ data }) =>
        Effect.logInfo(
          `Successfully logged in, account handle: ${data.handle}`,
        ),
      ),
    )

    let cursor: string | undefined = undefined
    let count = 0
    let lastTimestamp: number = Date.now()

    const parts = yield* _(
      Effect.loop(
        { count, lastTimestamp },
        ({ count, lastTimestamp }) => {
          return count < maxCount && lastTimestamp > endTimestamp
        },
        () => ({ count, lastTimestamp }),
        () =>
          pipe(
            crawlOnce(cursor),
            Effect.tap(({ items, cursor: newCursor }) => {
              count += items.length
              cursor = newCursor
              lastTimestamp = items.at(items.length - 1)?.alignTimestamp ?? 0
              return Effect.succeed(null)
            }),
            Effect.map(({ items }) => items),
          ),
      ),
    )

    yield* _(Effect.logInfo(`Crawled ${parts.length} parts`))

    return parts.flat().filter((item) => item.alignTimestamp > endTimestamp)
  }),
  Effect.annotateLogs('job', 'crawlBsky'),
)

const crawlOnce = (cursor: string | undefined) =>
  Effect.gen(function* (_) {
    const { data } = yield* _(
      getTimeline({
        algorithm: 'reverse-chronological',
        limit: 20,
        cursor,
      }),
    )
    const items: BskyCrawlItem[] = []
    for (const postView of data.feed) {
      if (
        postView.reason &&
        (typeof postView.reason.$type !== 'string' ||
          !postView.reason.$type.includes('reasonRepost'))
      ) {
        // Unknown reason type, skip
        yield* _(
          Effect.logWarning(
            `Unknown reason type in postView: ${
              postView.reason.$type as string
            }`,
          ),
        )
        continue
      }

      items.push({
        type: 'BskyCrawlItem',
        alignTimestamp: Date.parse(
          // Can safely cast to string because we've checked the type
          (postView.reason?.indexedAt as string | undefined) ??
            postView.post.indexedAt,
        ),
        data: postView,
      })
    }

    items.sort((a, b) => b.alignTimestamp - a.alignTimestamp)

    return { items, cursor: data.cursor }
  })

const getTimeline = (params: AppBskyFeedGetTimeline.QueryParams) =>
  pipe(
    BskyCrawlContext,
    Effect.flatMap(({ agent }) =>
      Effect.tryCatchPromise(
        () => agent.getTimeline(params),
        (e) =>
          new BskyCrawlError(
            'failed to get timeline',
            e instanceof Error ? e : null,
          ),
      ),
    ),
  )
