import SchemaBuilder from '@pothos/core'
import ErrorsPlugin from '@pothos/plugin-errors'
import RelayPlugin from '@pothos/plugin-relay'
import SimpleObjectsPlugin from '@pothos/plugin-simple-objects'
import ValidationPlugin from '@pothos/plugin-validation'
import WithInputPlugin from '@pothos/plugin-with-input'
import PothosEffectPlugin from 'pothos-plugin-effect'

import type { EffectfulBucket } from '@/bucket'

export interface PothosContext extends ExecutionContext {
  FEED_BUCKET: EffectfulBucket
}

export const builder = new SchemaBuilder<{
  Context: PothosContext
  DefaultFieldNullability: true
}>({
  defaultFieldNullability: true,
  plugins: [
    RelayPlugin,
    ErrorsPlugin,
    SimpleObjectsPlugin,
    ValidationPlugin,
    WithInputPlugin,
    PothosEffectPlugin,
  ],
  relayOptions: {
    clientMutationId: 'omit',
    cursorType: 'String',
  },
  errorOptions: {
    defaultResultOptions: {
      name: ({ parentTypeName, fieldName }) =>
        `${parentTypeName}${fieldName}Payload`,
    },
  },
})

builder.queryType({})
