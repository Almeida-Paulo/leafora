# Leafora

Leafora combines ecological project funding and public evidence registries.
Stellar/USDC provides support transactions and per-project allocation points;
Sui retains the evidence registry domain. Supporter NFT issuance is deferred.
The current funding release is restricted to testnet, pending contract validation.

## Repository Structure

```text
apps/
  web/          Public dApp interface
  api/          Backend API, database models and Sui indexing boundary
  admin/        Internal project operations panel
  capture/      Future field evidence capture application

blockchain/
  sui/leafora/  Sui Move package
  stellar/      Soroban USDC funding and allocation contract

docs/
  architecture/ Product and system architecture
  operations/   Deployment and runbooks
  product/      Brand and product scope
  security/     Supply-chain and vendor policy

infra/
  deploy/       Server setup and release scripts
  nginx/        Nginx configuration
  systemd/      Linux service units
```

## Stack

- Sui Move smart contracts
- Stellar Soroban / Rust and USDC
- Static web dApp
- Python/FastAPI backend
- PostgreSQL/PostGIS
- Nginx
- systemd
- Sui JSON-RPC

## Applications

### `apps/web`

Public dApp interface for:

- project marketplace;
- project detail pages;
- Stellar wallet connection (desktop extension and mobile/QR);
- project support flow;
- supporter dashboard;
- evidence registry;
- browser-side evidence hash preparation.

### `apps/api`

Backend API for:

- curated project records;
- evidence metadata;
- Sui event indexing;
- support records;
- validator/admin workflows;
- future project creator accounts.

### `apps/admin`

Internal operations panel for:

- curated project creation and editorial updates;
- project milestones;
- wallet-signed Stellar project publication, with funding goal and closing time;
- retained legacy Sui binding data.

### `blockchain/sui/leafora`

Move package for:

- shared project objects;
- project vaults;
- supporter NFTs;
- evidence records;
- conditional future revenue claims.

## Documentation

- [Stellar funding architecture and validation gates](docs/architecture/stellar-funding.md)

- [Target architecture](docs/architecture/target.md)
- [Backend architecture](docs/architecture/backend.md)
- [Contract design](docs/architecture/contract-design.md)
- [Wallet integration](docs/architecture/wallet-integration.md)
- [Deployment](docs/operations/deployment.md)
- [Backend runtime](docs/operations/backend-deployment.md)
- [Sui devnet reference](docs/operations/devnet-runbook.md)
- [Supply-chain security](docs/security/supply-chain.md)
- [Security policy](SECURITY.md)

## Development Policy

Leafora prioritizes long-term architecture over disposable prototypes.

- Domain boundaries must stay explicit.
- Contracts, API, frontend and infrastructure are separated.
- Database changes go through migrations.
- Chain state is indexed, not replaced.
- Browser dependencies must follow the supply-chain policy.
- Mainnet deployment requires contract tests, security review and legal review.
