import { pipe } from '@effect/data/Function'
import * as Option from '@effect/data/Option'
import * as Effect from '@effect/io/Effect'

export class R2InternalError extends Error {
  readonly _tag = 'R2InternalError'

  constructor() {
    super('R2 internal error')
  }
}

export class ObjectNotFoundError extends Error {
  readonly _tag = 'ObjectNotFoundError'

  constructor(key: string) {
    super(`R2 object with key "${key}" not found from the bucket`)
  }
}

export class ObjectNotJsonError extends Error {
  readonly _tag = 'ObjectNotJsonError'

  constructor(key: string) {
    super(`R2 object with key "${key}" is not JSON`)
  }
}

export class EffectfulBucket {
  constructor(private bucket: R2Bucket) {}

  get(key: string) {
    return pipe(
      Effect.tryCatchPromise(
        () => this.bucket.get(key),
        (e) => {
          console.error(e)
          return new R2InternalError()
        },
      ),
      Effect.flatMap((object) =>
        pipe(
          object,
          Option.fromNullable,
          Option.toEither(() => new ObjectNotFoundError(key)),
        ),
      ),
    )
  }

  getJson(key: string) {
    return pipe(
      this.get(key),
      Effect.flatMap((object) =>
        Effect.tryCatchPromise(
          () => object.text(),
          (e) => {
            console.error(e)
            return new R2InternalError()
          },
        ),
      ),
      Effect.flatMap((text) =>
        Effect.tryCatch(
          () => JSON.parse(text) as unknown,
          () => new ObjectNotJsonError(key),
        ),
      ),
    )
  }

  put(
    key: string,
    value: Parameters<R2Bucket['put']>[1],
    options?: Parameters<R2Bucket['put']>[2],
  ) {
    return Effect.tryCatchPromise(
      () => this.bucket.put(key, value, options),
      (e) => {
        console.error(e)
        return new R2InternalError()
      },
    )
  }

  delete(key: string) {
    return Effect.tryCatchPromise(
      () => this.bucket.delete(key),
      (e) => {
        console.error(e)
        return new R2InternalError()
      },
    )
  }

  list(
    options: R2ListOptions & {
      include?: ('httpMetadata' | 'customMetadata')[]
    },
  ) {
    return Effect.tryCatchPromise(
      () => this.bucket.list(options),
      (e) => {
        console.error(e)
        return new R2InternalError()
      },
    )
  }
}
