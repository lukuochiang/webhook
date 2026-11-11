import type { Context, Hono } from 'hono'
import { APP_VERSION, type AppEnv } from '../config/env'

export const openApiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'Webhook API',
    version: APP_VERSION,
    description:
      'Generic webhook receiver and request inspector running on Cloudflare Workers. ' +
      'Receive arbitrary HTTP requests, store them, and inspect them via the management API. ' +
      'This document reflects the implemented endpoints only.',
  },
  servers: [{ url: 'https://hook.fs.kg', description: 'Production' }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        description: 'Admin API token (ADMIN_TOKEN). Not required for /hook/{token} ingestion.',
      },
    },
    schemas: {
      ErrorEnvelope: {
        type: 'object',
        properties: {
          success: { type: 'boolean', enum: [false] },
          data: { type: 'null' },
          error: {
            type: 'object',
            properties: {
              code: { type: 'string' },
              message: { type: 'string' },
            },
          },
        },
      },
      Endpoint: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          description: { type: 'string', nullable: true },
          enabled: { type: 'boolean' },
          auth_mode: { type: 'string', enum: ['url', 'header', 'both'] },
          retention_days: { type: 'integer', nullable: true },
          response_status: { type: 'integer' },
          request_count: { type: 'integer' },
          created_at: { type: 'string', format: 'date-time' },
          updated_at: { type: 'string', format: 'date-time' },
          last_received_at: { type: 'string', format: 'date-time', nullable: true },
        },
      },
      EndpointCreated: {
        allOf: [
          { $ref: '#/components/schemas/Endpoint' },
          {
            type: 'object',
            properties: {
              webhook_url: { type: 'string' },
              token: { type: 'string', description: 'Returned only once.' },
            },
          },
        ],
      },
      EventSummary: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          endpoint_id: { type: 'string' },
          method: { type: 'string' },
          path: { type: 'string' },
          content_type: { type: 'string', nullable: true },
          body_size: { type: 'integer' },
          source_ip: { type: 'string', nullable: true },
          user_agent: { type: 'string', nullable: true },
          received_at: { type: 'string', format: 'date-time' },
        },
      },
      EventDetail: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          endpoint_id: { type: 'string' },
          method: { type: 'string' },
          path: { type: 'string' },
          query_string: { type: 'string' },
          headers: { type: 'object', additionalProperties: { type: 'string' } },
          content_type: { type: 'string', nullable: true },
          body: { type: 'string', nullable: true },
          body_encoding: { type: 'string', enum: ['utf8', 'base64', 'empty'] },
          body_size: { type: 'integer' },
          source_ip: { type: 'string', nullable: true },
          user_agent: { type: 'string', nullable: true },
          received_at: { type: 'string', format: 'date-time' },
        },
      },
      CaptureResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', enum: [true] },
          data: {
            type: 'object',
            properties: {
              event_id: { type: 'string' },
              received_at: { type: 'string', format: 'date-time' },
            },
          },
          error: { type: 'null' },
        },
      },
      Stats: {
        type: 'object',
        properties: {
          total_events: { type: 'integer' },
          last_24h: { type: 'integer' },
          last_7d: { type: 'integer' },
          endpoint_count: { type: 'integer' },
          by_endpoint: {
            type: 'array',
            items: { type: 'object', properties: { endpoint_id: { type: 'string' }, count: { type: 'integer' } } },
          },
          by_method: {
            type: 'array',
            items: { type: 'object', properties: { method: { type: 'string' }, count: { type: 'integer' } } },
          },
          last_event_at: { type: 'string', format: 'date-time', nullable: true },
        },
      },
      PagedEndpoints: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'object',
            properties: {
              items: { type: 'array', items: { $ref: '#/components/schemas/Endpoint' } },
              total: { type: 'integer' },
              page: { type: 'integer' },
              limit: { type: 'integer' },
            },
          },
          error: { type: 'null' },
        },
      },
    },
  },
  security: [{ bearerAuth: [] }],
  paths: {
    '/health': {
      get: {
        summary: 'Health check (public)',
        security: [],
        responses: {
          200: {
            description: 'Service status',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: {
                      type: 'object',
                      properties: {
                        status: { type: 'string' },
                        service: { type: 'string' },
                        version: { type: 'string' },
                        env: { type: 'string' },
                        time: { type: 'string', format: 'date-time' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/hook/{token}': {
      summary: 'Receive a webhook (public, protected by the URL token)',
      description:
        'Accepts any HTTP method and any sub-path. The token is part of the URL. ' +
        'Optionally requires an Authorization: Bearer <token> header when the endpoint auth_mode is header/both.',
      parameters: [
        { name: 'token', in: 'path', required: true, schema: { type: 'string' } },
      ],
      get: { summary: 'Receive GET' },
      post: { summary: 'Receive POST' },
      put: { summary: 'Receive PUT' },
      patch: { summary: 'Receive PATCH' },
      delete: { summary: 'Receive DELETE' },
      head: { summary: 'Receive HEAD' },
      options: { summary: 'Receive OPTIONS' },
      responses: {
        200: { description: 'Stored', content: { 'application/json': { schema: { $ref: '#/components/schemas/CaptureResponse' } } } },
        404: { description: 'Unknown endpoint', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } } },
        413: { description: 'Body too large', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } } },
      },
    },
    '/api/v1/endpoints': {
      get: {
        summary: 'List endpoints',
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
          { name: 'enabled', in: 'query', schema: { type: 'boolean' } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
        ],
        responses: { 200: { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/PagedEndpoints' } } } } },
      },
      post: {
        summary: 'Create endpoint',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: {
                  name: { type: 'string' },
                  description: { type: 'string' },
                  enabled: { type: 'boolean' },
                  auth_mode: { type: 'string', enum: ['url', 'header', 'both'] },
                  retention_days: { type: 'integer', minimum: 0, maximum: 3650 },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Created', content: { 'application/json': { schema: { $ref: '#/components/schemas/EndpointCreated' } } } },
          422: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } } },
        },
      },
    },
    '/api/v1/endpoints/{id}': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      get: { summary: 'Get endpoint detail', responses: { 200: { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/Endpoint' } } } } } },
      patch: {
        summary: 'Update endpoint',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  description: { type: 'string' },
                  enabled: { type: 'boolean' },
                  auth_mode: { type: 'string', enum: ['url', 'header', 'both'] },
                  retention_days: { type: 'integer', minimum: 0, maximum: 3650 },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/Endpoint' } } } } },
      },
      delete: { summary: 'Delete endpoint (and all its events)', responses: { 200: { description: 'Deleted' } } },
    },
    '/api/v1/endpoints/{id}/rotate-token': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      post: { summary: 'Rotate the endpoint token (old token invalidated)', responses: { 200: { description: 'Rotated', content: { 'application/json': { schema: { $ref: '#/components/schemas/EndpointCreated' } } } } } },
    },
    '/api/v1/endpoints/{id}/events': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      delete: {
        summary: 'Clear all events for an endpoint',
        parameters: [{ name: 'confirm', in: 'query', required: true, schema: { type: 'string', enum: ['true'] } }],
        responses: { 200: { description: 'Cleared' }, 400: { description: 'Confirmation required' } },
      },
    },
    '/api/v1/events': {
      get: {
        summary: 'List captured events',
        parameters: [
          { name: 'endpoint_id', in: 'query', schema: { type: 'string' } },
          { name: 'method', in: 'query', schema: { type: 'string' } },
          { name: 'start_time', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'end_time', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
        ],
        responses: {
          200: {
            description: 'OK',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: {
                      type: 'object',
                      properties: {
                        items: { type: 'array', items: { $ref: '#/components/schemas/EventSummary' } },
                        total: { type: 'integer' },
                        page: { type: 'integer' },
                        limit: { type: 'integer' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/v1/events/{id}': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      get: { summary: 'Get event detail (full body)', responses: { 200: { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/EventDetail' } } } } } },
      delete: { summary: 'Delete a single event', responses: { 200: { description: 'Deleted' } } },
    },
    '/api/v1/stats': {
      get: { summary: 'Aggregate statistics', responses: { 200: { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/Stats' } } } } } },
    },
    '/api/v1/openapi.json': {
      get: { summary: 'This OpenAPI document', security: [], responses: { 200: { description: 'OpenAPI JSON' } } },
    },
  },
} as const

export function openapiHandler(c: Context) {
  return c.json(openApiSpec as unknown as Record<string, unknown>, 200)
}

export function docsHandler(c: Context) {
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Webhook - API Docs</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    window.onload = () => {
      window.ui = SwaggerUIBundle({
        url: '/api/v1/openapi.json',
        dom_id: '#swagger-ui',
      });
    };
  </script>
</body>
</html>`
  return c.html(html)
}

export function registerOpenApi(app: Hono<{ Bindings: AppEnv }>) {
  app.get('/api/v1/openapi.json', openapiHandler)
  app.get('/docs', docsHandler)
}
