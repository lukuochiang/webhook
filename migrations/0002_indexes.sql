-- 0002_indexes.sql
-- Indexes on webhook_endpoints for lookup and listing.

CREATE INDEX IF NOT EXISTS idx_endpoints_token_hash ON webhook_endpoints(token_hash);
CREATE INDEX IF NOT EXISTS idx_endpoints_enabled ON webhook_endpoints(enabled);
CREATE INDEX IF NOT EXISTS idx_endpoints_created_at ON webhook_endpoints(created_at);
