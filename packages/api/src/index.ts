import { createYoga } from 'graphql-yoga'

import { EffectfulBucket } from '@/bucket'
import { schema } from '@/schema'
import type { PothosContext } from '@/schema/builder'

export interface Env {
  FEED_BUCKET: R2Bucket
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
}
