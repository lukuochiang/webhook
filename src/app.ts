import { Hono } from 'hono'
import { APP_VERSION, type AppEnv } from './config/env'
import { requestId } from './middleware/request-id'
import { errorHandler } from './middleware/error-handler'
import { adminAuth } from './middleware/admin-auth'
import { registerEndpoints } from './routes/endpoints'
import { registerEvents } from './routes/events'
import { registerStats } from './routes/stats'
import { registerWebhook } from './routes/webhook'
import { registerHealth } from './routes/health'
import { registerOpenApi } from './routes/openapi'
import { jsonSuccess } from './utils/response'

export const app = new Hono<{ Bindings: AppEnv }>()

// Global middleware
app.use('*', requestId)
app.onError(errorHandler)

// Public routes
app.get('/', (c) =>
  jsonSuccess(
    c,
    {
      name: 'Webhook',
      version: APP_VERSION,
      docs: '/docs',
      openapi: '/api/v1/openapi.json',
      health: '/health',
    },
    200
  )
)
registerHealth(app)
registerOpenApi(app)

// Webhook capture (public, protected by the URL token)
registerWebhook(app)

// Admin management API (bearer token protected)
const api = new Hono<{ Bindings: AppEnv }>()
api.use('*', adminAuth)
registerEndpoints(api)
registerEvents(api)
registerStats(api)
app.route('/api/v1', api)

export default app
