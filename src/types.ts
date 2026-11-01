import type { EndpointRow } from './schemas/endpoint.schema'

// Shared Hono context variables used across middleware and routes.
declare module 'hono' {
  interface ContextVariableMap {
    requestId: string
    captureEndpoint: EndpointRow
  }
}
