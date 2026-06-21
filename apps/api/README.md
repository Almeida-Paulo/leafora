# Leafora API

Backend API for Leafora's project catalog, evidence registry, supporter records
and Sui event indexing.

## Responsibility

The backend is the operational layer that the blockchain should not handle:

- project curation and publishing workflow;
- evidence package metadata;
- upload orchestration for IPFS, Walrus or Arweave;
- Sui event indexing;
- dashboard queries;
- validator/admin review;
- anti-fraud controls before third-party project submissions open.

## Runtime

- Python 3.10+
- FastAPI
- PostgreSQL/PostGIS
- SQLAlchemy
- Alembic
- Sui JSON-RPC

## Local Development

```bash
cd apps/api
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env
uvicorn app.main:create_app --factory --reload --host 0.0.0.0 --port 8000
```

## Production

Run behind Nginx or a private network boundary. Public traffic should reach the
API through TLS. Write endpoints require `X-Admin-Token`.
