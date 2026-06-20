# Sui Devnet Reference

Leafora targets Sui devnet before mainnet. Devnet is used for contract
publication, pilot project creation, wallet signing validation and event
indexing.

## Network

```text
RPC: https://fullnode.devnet.sui.io:443
Network: devnet
```

## Move Package

```text
blockchain/sui/leafora
```

Canonical build command:

```bash
sui move build
```

Canonical publish command:

```bash
sui client publish --gas-budget 100000000
```

Publication output must be captured for:

- package ID;
- `AdminCap` object ID.

## Web Configuration

The browser application reads chain configuration from:

```text
apps/web/assets/js/config.js
apps/web/assets/js/projects.js
```

Required values after publication:

- package ID;
- project object ID;
- vault object ID.

## Project Creation

Each pilot project is created by calling:

```text
<PACKAGE_ID>::leafora::create_project
```

Funding values are represented in MIST:

```text
1 SUI = 1_000_000_000 MIST
```

The resulting project and vault object IDs must be recorded in the web
configuration and, once the backend indexer is enabled, in the API database.

## Browser Signing

Browser transaction signing requires:

```text
apps/web/vendor/leafora-sui-sdk.js
```

The adapter contract is documented in:

```text
apps/web/vendor/README.md
docs/security/vendor-manifest.md
```

The frontend connects wallets without this adapter, but does not execute
support transactions until transaction construction is available.

## Acceptance Checks

- Move package builds on devnet.
- Package ID is configured in the web app.
- Every visible project has project and vault object IDs.
- Wallet connection is restricted to Sui devnet.
- `support_project` produces a transaction digest.
- Supporter NFT object is created.
- Explorer link resolves to the devnet transaction.

