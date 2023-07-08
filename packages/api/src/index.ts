import { BskyAgent } from '@atproto/api'
import { pipe } from '@effect/data/Function'
import * as Effect from '@effect/io/Effect'
import * as Logger from '@effect/io/Logger'
import { createYoga } from 'graphql-yoga'

import { R2LogStore, R2LogStoreContext } from '@/R2LogStore'
import { EffectfulBucket } from '@/bucket'
import { CrawlContext, crawl } from '@/crawler'
import { BskyCrawlContext } from '@/crawler/bsky'
import { schema } from '@/schema'
import type { PothosContext } from '@/schema/builder'

export interface Env {
  FEED_BUCKET: R2Bucket
  LOG_BUCKET: R2Bucket
  BSKY_IDENTIFIER: string
  BSKY_PASSWORD: string
}

const yoga = createYoga<PothosContext>({ schema })

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    return yoga.handleRequest(request, {
      ...ctx,
      FEED_BUCKET: new EffectfulBucket(env.FEED_BUCKET),
    })
  },
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const loggerPromises = new Set<Promise<void>>()

    ctx.waitUntil(
      pipe(
        crawl,
        Effect.provideService(
          CrawlContext,
          CrawlContext.of({
            FEED_BUCKET: new EffectfulBucket(env.FEED_BUCKET),
            cronTimestamp: event.scheduledTime,
          }),
        ),
        Effect.provideService(
          BskyCrawlContext,
          BskyCrawlContext.of({
            agent: new BskyAgent({ service: 'https://bsky.social' }),
            maxCount: 100,
            account: {
              identifier: env.BSKY_IDENTIFIER,
              password: env.BSKY_PASSWORD,
            },
          }),
        ),
        Effect.provideLayer(
          Logger.addEffect(
            Effect.gen(function* (_) {
              const store = yield* _(R2LogStore)
              return pipe(
                Logger.stringLogger,
                Logger.map((log) => store.putLine(log)),
                Logger.map(Effect.runPromise),
                Logger.map((promise) => {
                  loggerPromises.add(promise)
                  void promise.then(() => loggerPromises.delete(promise))
                }),
              )
            }),
          ),
        ),
        Effect.provideService(
          R2LogStoreContext,
          R2LogStoreContext.of({
            LOG_BUCKET: new EffectfulBucket(env.LOG_BUCKET),
            fileName: `cron-${new Date(event.scheduledTime).toISOString()}`,
          }),
        ),
        (eff) => Effect.runPromise(eff).then(() => Promise.all(loggerPromises)),
      ),
    )
  },
}
