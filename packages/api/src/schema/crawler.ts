import { BskyAgent } from '@atproto/api'
import { pipe } from '@effect/data/Function'
import * as Effect from '@effect/io/Effect'

import { CrawlContext, crawl } from '@/crawler'
import { BskyCrawlContext } from '@/crawler/bsky'
import { builder } from '@/schema/builder'
import { InternalError } from '@/schema/error'

const CrawlItemsCount = builder.simpleObject('CrawlItemsCount', {
  fields: (t) => ({
    all: t.int(),
    bsky: t.int(),
  }),
})

const CrawlPayload = builder.simpleObject('CrawlPayload', {
  fields: (t) => ({
    uploadedChunks: t.int(),
    itemsCount: t.field({ type: CrawlItemsCount }),
  }),
})

builder.mutationField('crawl', (t) =>
  t.effect({
    type: CrawlPayload,
    errors: {
      types: [InternalError],
    },
    resolve: (_, __, ctx) =>
      pipe(
        crawl,
        Effect.provideService(
          CrawlContext,
          CrawlContext.of({
            FEED_BUCKET: ctx.FEED_BUCKET,
            jobTimestamp: Date.now(),
          }),
        ),
        Effect.provideService(
          BskyCrawlContext,
          BskyCrawlContext.of({
            agent: new BskyAgent({ service: 'https://bsky.social' }),
            account: {
              identifier: ctx.env.BSKY_IDENTIFIER,
              password: ctx.env.BSKY_PASSWORD,
            },
            maxCount: 100,
          }),
        ),
        Effect.catchTags({
          R2InternalError: (e) => Effect.fail(new InternalError(e.message)),
          BskyCrawlError: (e) => Effect.fail(new InternalError(e.message)),
        }),
      ),
  }),
)
