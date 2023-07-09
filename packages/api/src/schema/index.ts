import { pipe } from '@effect/data/Function'
import * as Option from '@effect/data/Option'
import * as Effect from '@effect/io/Effect'
import { ZodError } from 'zod'

import { builder } from './builder'
import './error'
import './crawler'

builder.queryField('hello', (t) =>
  t.effect({
    type: 'String',
    args: {
      name: t.arg.string({
        required: false,
        validate: { minLength: 5 },
      }),
    },
    errors: {
      types: [ZodError],
    },
    resolve: (_, args) =>
      pipe(
        Option.fromNullable(args.name),
        Option.getOrElse(() => 'World'),
        Effect.succeed,
        Effect.map((name) => `Hello, ${name}!`),
      ),
  }),
)

export const schema = builder.toSchema({
  sortSchema: true,
})
