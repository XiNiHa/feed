import { ZodError } from 'zod'

import { builder } from './builder'

export const ErrorInterface = builder.interfaceRef<Error>('Error').implement({
  fields: (t) => ({
    message: t.exposeString('message'),
  }),
})

builder.objectType(Error, {
  interfaces: [ErrorInterface],
  name: 'BaseError',
})

builder.objectType(ZodError, {
  interfaces: [ErrorInterface],
  name: 'ValidationError',
  fields: (t) => ({
    message: t.string({
      resolve: (parent) =>
        parent.issues.map((issue) => issue.message).join(', '),
    }),
  }),
})
