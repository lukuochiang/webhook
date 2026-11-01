# Webhook Inbox & Inspector — API Reference

Base URL (production): `https://hook.fs.kg`
Management API prefix: `/api/v1`
Capture prefix: `/hook/{token}`

All management endpoints require:

```
Authorization: Bearer <ADMIN_TOKEN>
```

All responses use the unified envelope:

```json
{ "success": true, "data": { ... }, "error": null }
{ "success": false, "data": null, "error": { "code": "CODE", "message": "..." } }
```

---

## Health (public)

### `GET /health`

```json
{ "success": true, "data": { "status": "ok", "service": "webhook", "version": "1.0.0", "env": "production", "time": "2026-11-02T00:00:00.000Z" } }
```

---

## Endpoints

### `POST /api/v1/endpoints`

Body:

| field            | type     | required | notes |
| ---------------- | -------- | -------- | ----- |
| `name`           | string   | yes      | 1–200 chars |
| `description`    | string   | no       | ≤ 1000 chars |
| `enabled`        | boolean  | no       | default `true` |
| `auth_mode`      | enum     | no       | `url` (default) \| `header` \| `both` |
| `retention_days` | integer  | no       | 0–3650; `0` = disable cleanup for this endpoint |

Returns `201` with the endpoint plus **`token`** and **`webhook_url`** (shown once).

### `GET /api/v1/endpoints`

Query: `page` (≥1, default 1), `limit` (1–100, default 20), `enabled` (`true`/`false`), `search`.
Returns `{ items: [...], total, page, limit }`. **Never** includes `token`/`token_hash`.

### `GET /api/v1/endpoints/:id`
### `PATCH /api/v1/endpoints/:id`
Body mirrors the create fields (all optional). Returns the updated endpoint.
### `DELETE /api/v1/endpoints/:id`
Deletes the endpoint **and** all its events (single transaction).
### `POST /api/v1/endpoints/:id/rotate-token`
Returns a new `token` + `webhook_url`; the previous token is invalidated immediately.
### `DELETE /api/v1/endpoints/:id/events?confirm=true`
Deletes all events for the endpoint. Requires `confirm=true` (otherwise `400`).

---

## Capture (public, protected by URL token)

### `ANY /hook/:token[/...]`

`GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`, `HEAD` are all accepted on any
sub-path. The endpoint is resolved by the URL token; when `auth_mode` is `header` or
`both`, an `Authorization: Bearer <token>` header is also required.

Success (`200`):

```json
{ "success": true, "data": { "event_id": "evt_xxx", "received_at": "2026-11-02T00:00:00.000Z" } }
```

Errors: `404` unknown token, `403` disabled endpoint, `401` missing/invalid header
token, `413` body exceeds `MAX_BODY_SIZE`.

Stored per event: method, path (sub-path only, token stripped), query string, headers
(redacted), content type, body (utf8 text or base64 binary), optional parsed JSON,
body size, source IP (optional), user agent, received timestamp.

---

## Events

### `GET /api/v1/events`

Query: `endpoint_id`, `method`, `start_time` / `end_time` (ISO 8601), `page`, `limit`.
Returns a **summary** list (no body). Sorted by `received_at` descending.

### `GET /api/v1/events/:id`
Full detail including `headers`, `body`, `body_encoding`, `query_string`.

### `DELETE /api/v1/events/:id`
Deletes a single event.

---

## Stats

### `GET /api/v1/stats`

```json
{
  "success": true,
  "data": {
    "total_events": 123,
    "last_24h": 40,
    "last_7d": 95,
    "endpoint_count": 3,
    "by_endpoint": [{ "endpoint_id": "ep_x", "count": 80 }],
    "by_method": [{ "method": "POST", "count": 70 }],
    "last_event_at": "2026-11-02T00:00:00.000Z"
  }
}
```

---

## OpenAPI

- `GET /api/v1/openapi.json` — OpenAPI 3.1 document (reflects the implemented API).
- `GET /docs` — Swagger UI.
