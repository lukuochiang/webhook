-- 0003_event_indexes.sql
-- Indexes on webhook_events for filtering, sorting and cleanup.

CREATE INDEX IF NOT EXISTS idx_events_endpoint_id ON webhook_events(endpoint_id);
CREATE INDEX IF NOT EXISTS idx_events_received_at ON webhook_events(received_at);
CREATE INDEX IF NOT EXISTS idx_events_method ON webhook_events(method);
CREATE INDEX IF NOT EXISTS idx_events_endpoint_received ON webhook_events(endpoint_id, received_at);
