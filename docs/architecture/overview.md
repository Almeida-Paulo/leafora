# Leafora Architecture

## Decision

Leafora will use a professional Web3 stack without npm/pnpm:

- static HTML/CSS/JavaScript modules for the frontend;
- Nginx as the production web server;
- no Node build step;
- no npm/pnpm dependency tree;
- Sui SDK adapter vendorized manually as `apps/web/vendor/leafora-sui-sdk.js` when real browser transaction construction is enabled;
- Sui Move for devnet contracts;
- Backend/indexer only when the app needs persistence, project submission,
  storage orchestration and on-chain event indexing.

## Why Sui

Sui is object-centric, which fits Leafora's domain:

- project as object;
- vault as object;
- supporter NFT as object;
- evidence record as object;
- future conditional claim accounting through support NFTs.

The first public release targets Sui devnet. Mainnet requires reviewed contracts,
operational monitoring, production RPC and legal/compliance review.

## Official References

- Mysten Sui SDK and wallet docs for the browser transaction layer.
- Sui CLI: contract build/publish and devnet configuration.
- Nginx: static SPA serving through `try_files`.

## RPC Policy

The default `apps/web/assets/js/config.js` uses Mysten's public devnet endpoint:

```text
https://fullnode.devnet.sui.io:443
```

Public endpoints are acceptable for early development. For real users, use a
dedicated RPC provider or self-hosted full node. This avoids rate limits and
improves reliability.

## OpenZeppelin / Alchemy / Other Libraries

OpenZeppelin is essential if Leafora later deploys EVM contracts. It is not the
right base for Sui Move contracts. For the current Sui path, use the Sui
Framework, Mysten SDKs and Move tests.

Alchemy, QuickNode or other RPC providers can be evaluated for production Sui
RPC if they support the required Sui APIs and SLA.

Any browser library must follow [supply-chain.md](../security/supply-chain.md).

## Runtime Shape

```text
Browser
  Static JS app
  injected Sui wallet
  vendorized Sui transaction adapter
  SHA-256 evidence hashing
  optional geolocation

Nginx
  serves apps/web
  security headers
  HTTPS

Sui devnet
  Project
  ProjectVault
  SupporterNFT
  EvidenceRecord
  ConditionalRevenueClaim

Future backend
  project admin
  storage upload
  event indexer
  registry API
  validator workflow
```
