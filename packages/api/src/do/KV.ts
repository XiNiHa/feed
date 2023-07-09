import { createTRPCProxyClient, httpBatchLink } from '@trpc/client'
import { initTRPC } from '@trpc/server'
import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import { z } from 'zod'

import type { Env } from '@/index'

interface Context {
  storage: DurableObjectStorage
}

const t = initTRPC.context<Context>().create()

const router = t.router({
  get: t.procedure
    .input(
      z.object({
        key: z.string(),
      }),
    )
    .query(({ input: { key }, ctx: { storage } }) => {
      return storage.get(key)
    }),
  set: t.procedure
    .input(
      z.object({
        key: z.string(),
        value: z.any(),
      }),
    )
    .mutation(({ input: { key, value }, ctx: { storage } }) => {
      return storage.put(key, value)
    }),
})

export class KV implements DurableObject {
  constructor(
    public state: DurableObjectState,
    public env: Env,
  ) {}

  fetch(req: Request): Promise<Response> {
    return fetchRequestHandler({
      endpoint: '/trpc',
      req,
      router,
      createContext: () => ({
        storage: this.state.storage,
      }),
    })
  }
}

export const makeKVClient = (kvNamespace: DurableObjectNamespace) =>
  createTRPCProxyClient<typeof router>({
    links: [
      httpBatchLink({
        url: 'http://app.do/trpc',
        fetch: (...args) =>
          kvNamespace
            .get(kvNamespace.idFromName('default'))
            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
            .fetch(...(args as [any])),
      }),
    ],
  })

export type KVClient = ReturnType<typeof makeKVClient>
