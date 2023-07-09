import { BskyAgent } from '@atproto/api'
import { pipe } from '@effect/data/Function'
import * as Effect from '@effect/io/Effect'

import { CrawlContext, crawl } from '@/crawler'
import { BskyCrawlContext } from '@/crawler/bsky'
import { makeKVClient } from '@/do/KV'
import { builder } from '@/schema/builder'
import { InternalError } from '@/schema/error'

const CrawlPerSourceItemsCount = builder.simpleObject(
  'CrawlPerSourceItemsCount',
  {
    fields: (t) => ({
      id: t.string(),
      count: t.int(),
    }),
  },
)

const CrawlItemsCount = builder.simpleObject('CrawlItemsCount', {
  fields: (t) => ({
    all: t.int(),
    perSources: t.field({ type: [CrawlPerSourceItemsCount] }),
  }),
})

const CrawlPayload = builder.simpleObject('CrawlPayload', {
  fields: (t) => ({
    uploadedChunks: t.int(),
    frontTimestamp: t.float(),
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
        crawl({
          id: 'bsky',
          type: 'bsky',
          context: BskyCrawlContext.context({
            agent: new BskyAgent({ service: 'https://bsky.social' }),
            account: {
              identifier: ctx.env.BSKY_IDENTIFIER,
              password: ctx.env.BSKY_PASSWORD,
            },
            maxCount: 100,
          }),
        }),
        Effect.provideService(
          CrawlContext,
          CrawlContext.of({
            FEED_BUCKET: ctx.FEED_BUCKET,
            kvClient: makeKVClient(ctx.env.KV_DO),
            jobTimestamp: Date.now(),
          }),
        ),
        Effect.catchTags({
          R2InternalError: (e) => Effect.fail(new InternalError(e.message)),
          BskyCrawlError: (e) => Effect.fail(new InternalError(e.message)),
        }),
      ),
  }),
)
