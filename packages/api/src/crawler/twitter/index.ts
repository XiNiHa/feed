import * as Context from '@effect/data/Context'
import { pipe } from '@effect/data/Function'
import * as Effect from '@effect/io/Effect'

import { CrawlConfigContext } from '@/crawler'
import type { CrawlItem } from '@/crawler'

export interface TwitterCrawlContext {
  maxCount: number
}

export const TwitterCrawlContext = Context.Tag<TwitterCrawlContext>()

export interface TwitterCrawlItem extends CrawlItem {
  type: 'TwitterCrawlItem'
}

export const crawlTwitter = (sourceId: string) =>
  pipe(
    Effect.gen(function* (_) {
      // TODO: implement
      yield* _(TwitterCrawlContext)
      yield* _(CrawlConfigContext)
      return <TwitterCrawlItem[]>[]
    }),
    Effect.annotateLogs('job', 'crawlTwitter'),
  )
