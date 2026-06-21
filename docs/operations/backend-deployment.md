# Backend Runtime Reference

The Leafora API is a FastAPI service running behind Nginx. It persists project,
evidence and support records in PostgreSQL and provides the indexing boundary
for Sui events.

## Runtime Dependencies

```text
Python 3.10+
PostgreSQL
PostGIS
Nginx
systemd
```

## Database

The API expects a PostgreSQL database with the PostGIS extension enabled.
Schema changes are managed by Alembic migrations under:

```text
apps/api/app/db/migrations
```

## Environment

Runtime configuration is read from:

```text
/etc/leafora/api.env
```

Required variables:

```text
LEAFORA_ENV
LEAFORA_DATABASE_URL
LEAFORA_ADMIN_TOKEN
LEAFORA_SUI_RPC_URL
LEAFORA_SUI_NETWORK
LEAFORA_CORS_ORIGINS
```

`apps/api/.env.example` documents the expected shape without deployment-specific
values.

## Service

The systemd unit template is:

```text
infra/systemd/leafora-api.service
```

Default binding:

```text
127.0.0.1:18473
```

Nginx proxies `/api/` to this local service.

## Health Check

```text
GET /api/health
```

Expected response:

```json
{"status":"ok","service":"leafora-api"}
```
