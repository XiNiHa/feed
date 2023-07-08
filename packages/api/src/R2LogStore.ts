import * as Context from '@effect/data/Context'
import * as Effect from '@effect/io/Effect'

import type { EffectfulBucket } from '@/bucket'

interface R2LogStoreContext {
  LOG_BUCKET: EffectfulBucket
  fileName: string
}

export const R2LogStoreContext = Context.Tag<R2LogStoreContext>()

export const R2LogStore = Effect.gen(function* (_) {
  const { LOG_BUCKET, fileName } = yield* _(R2LogStoreContext)
  let buffer = ''
  let lastWrite = Date.now()
  let putTimeout: NodeJS.Timeout | null = null

  const put = Effect.gen(function* (_) {
    if (putTimeout) {
      clearTimeout(putTimeout)
      putTimeout = null
    }
    yield* _(LOG_BUCKET.put(`${fileName}.log`, buffer))
    lastWrite = Date.now()
  })

  return {
    putLine: (line: string) =>
      Effect.async((resume: (_: typeof put) => void) => {
        buffer += line + '\n'
        const delta = Date.now() - lastWrite
        if (delta > 1000) resume(put)
        else if (!putTimeout) {
          putTimeout = setTimeout(() => resume(put), 1000 - delta)
        }
      }),
  }
})
