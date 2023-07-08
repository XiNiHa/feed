import { createYoga } from 'graphql-yoga'

import { schema } from '@/schema'
import type { PothosContext } from '@/schema/builder'

const yoga = createYoga<PothosContext>({ schema })

export default {
  async fetch(
    request: Request,
    _: unknown,
    ctx: ExecutionContext,
  ): Promise<Response> {
    return yoga.handleRequest(request, { ...ctx })
  },
}
