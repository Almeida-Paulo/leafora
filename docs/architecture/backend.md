# Backend Architecture

Leafora uses the blockchain for public settlement, asset ownership and evidence
anchors. The backend exists for operational state that should not live only in a
smart contract.

## Why The Backend Exists

The backend is required for:

- project curation before a project is published on-chain;
- administrative review;
- evidence package metadata and upload orchestration;
- Sui event indexing;
- fast dashboard queries;
- anti-fraud workflows;
- validator queues;
- audit trails;
- future project creator accounts;
- future compliance/KYB/KYC workflows.

The smart contract should not store large files, private workflow state,
moderation queues or expensive query views.

## Stack

```text
Python 3.11+
FastAPI
PostgreSQL + PostGIS
SQLAlchemy
Alembic
Sui JSON-RPC
Nginx reverse proxy
systemd service
```

## API App

```text
apps/api
```

Responsibilities:

- expose public project data;
- expose project evidence records;
- expose wallet support records;
- receive admin-only records from project publishing and Sui indexing;
- provide a stable backend contract for `apps/web` and future `apps/capture`.

## Database

Initial tables:

- `projects`;
- `evidence_records`;
- `supports`.

Future tables should be added by Alembic migrations only.

## Security Boundary

Public reads:

- `GET /api/projects`;
- `GET /api/projects/{slug}`;
- `GET /api/projects/{slug}/evidence`;
- `GET /api/wallets/{wallet_address}/supports`.

Administrative writes:

- require `X-Admin-Token`;
- should move to proper admin authentication before external operators are
  allowed to create projects.

## Relationship With Sui

Sui remains the source of truth for:

- project object IDs;
- vault object IDs;
- support transactions;
- supporter NFT IDs;
- evidence object IDs;
- distribution/claim events.

The backend indexes and serves these records. It does not replace on-chain
ownership.

