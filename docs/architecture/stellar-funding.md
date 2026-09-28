# Stellar Funding and Allocation

## Scope

Stellar settles USDC support and records non-transferable allocation points (AP).
Sui retains the separate evidence/registry domain. No payment bridge, Sui wallet,
cross-chain AP replication or supporter NFT is required for this flow.

The current release is restricted to Stellar testnet. The API rejects public-network
configuration. Mainnet release requires contract compilation, contract tests, deployment
verification, custody and funding-release decisions, dependency review and independent
security review. Passing API tests is not evidence that the contract has passed its tests.

## Accounting

- One USDC equals one AP. Both use seven-decimal integer units; one unit is 0.0000001.
- Positions belong to a wallet and project. Global wallet totals are updated atomically
  with the project position, token transfer and funding total.
- The goal must be positive. It is a soft target, not a cap. The ledger timestamp,
  not the browser clock, enforces the exclusive closing deadline.
- Repeated amounts are permitted. Each wallet/project position has a monotonically
  increasing nonce. Reusing a consumed nonce cannot transfer funds or issue AP again.
- Raised capital remains in the contract. There is no owner withdrawal, platform fee,
  automatic refund or milestone release in this release, preserving the earlier staged
  funding decision. Test funds only; this is a mainnet release gate, not an implied payout.
- AP never represent carbon credits, certified impact or a currently offered yield.

Future revenue is separately funded in USDC. Activation requires the contract administrator
and is initially disabled for every project. A cumulative revenue index settles the existing
position before new AP are added. New AP do not receive earlier revenue. Claims preserve
fractional remainders and cannot consume contributed capital. Distribution rounding residue
remains reserved in the contract; it is not reassigned to later contributors.

## Sources of Truth

The database holds curated editorial content and signing requests, not editable Stellar
balances. Project IDs are SHA-256 of UTF-8 `leafora:project:v1:` followed by the slug.
Publication commits the canonical editorial JSON hash alongside goal and deadline.
The canonical JSON uses sorted keys, no insignificant whitespace and UTF-8 without ASCII
escaping. The exact committed field set is `EDITORIAL_FIELDS` in the API service.

Published editorial fields cannot be overwritten through the current editor. Milestone
updates and evidence remain separate records. A mismatch between the committed hash and
editorial content fails explicitly; it never substitutes demo content or a zero balance.
The canonical metadata is available at `/api/funding/projects/{slug}/metadata` for independent
hash verification. Editorial status does not pause on-chain funding: the panel provides
separate pause/resume transactions requiring the administrator wallet. Resuming never
extends the original closing deadline.

The public catalog only includes projects found in the configured contract. Existing draft
projects need publication by the administrator wallet. Historical Sui columns and objects
are retained without converting their values into USDC or AP. No mock raised amount or
mock supporter count is imported into the funding ledger.

The current read path queries contract state through simulation. Reads do not renew storage
TTL; successful contract writes extend the touched entries. Archived state requires restore
and contract TTL maintenance. An RPC error or restore preamble must not become an empty
portfolio. Ledger/event indexing and caching can accelerate this read path without becoming
the authority for balances. Database backups remain necessary to preserve editorial content.

## Signing and Recovery

The API constructs and simulates a single unsigned contract invocation using the official
Python SDK. It stores the exact transaction hash, network, contract, expiry and envelope.
The connected wallet signs; no private signing key is stored by the API. Submission rejects
changed transaction bodies, missing signatures, expired requests and other deployments.
Signature validity and contract authorization are enforced by Stellar.

Only source-account transaction signing is required. Desktop Freighter uses its official
extension API. Mobile wallets use WalletConnect v2 with `stellar_signXDR` and the explicit
`stellar:testnet` namespace. WalletConnect does not imply support for every installed wallet.
The selected wallet must support this namespace and Soroban transaction signing.

Before submission, the browser retains the signed envelope and hash for recovery. They are
not used as proof of balance. Retrying resends the same envelope. An ambiguous response
remains pending; a fresh support is not automatically generated. `NOT_FOUND` is only treated
as expired when the RPC retention interval covers the complete signing window and a ledger
has closed beyond its maxTime. Old unknown transactions require reconciliation by hash.

WalletConnect requires a project ID and domain allowlist at the provider. Its relay and wallet
directory are external availability dependencies. The browser cannot enumerate native mobile
apps; selection, QR and deep links provide the connection path. Account activation, the
correct USDC trustline/balance and sufficient XLM for fees/reserves remain prerequisites.
Friendbot supplies test XLM, not USDC. The USDC issuer must be verified against Circle's
official network-specific information; a token symbol alone is insufficient.

## Configuration and Release Evidence

Runtime variables are listed in `apps/api/.env.example`; it contains no deployment domain,
private key or credential. `LEAFORA_STELLAR_ADMIN` is the public administrator address.
`LEAFORA_STELLAR_USDC_ISSUER` identifies the selected testnet asset; the API derives its
Stellar Asset Contract address and checks it against the funding contract configuration.
The API also checks the RPC network passphrase before preparing payments.

Required release operations: install the updated API dependencies, apply migration
`0003_stellar_intents`, compile/test the Rust contract, deploy with constructor arguments
`administrator` and `usdc`, configure the resulting contract ID and public addresses,
register WalletConnect origins, restart only the Leafora API, and publish curated projects
through the administrator panel. Existing Nginx ports and other applications do not change.

Validation commands:

```text
python -m pytest apps/api/tests scripts/tests -q
node scripts/tests/test_money.mjs
cargo test --manifest-path blockchain/stellar/Cargo.toml
stellar contract build --manifest-path blockchain/stellar/Cargo.toml
python scripts/build_web.py
```

The native Rust suite covers repeated amounts, replay, fractions, deadline boundaries,
oversubscription, authorization, rollback and future revenue isolation. It must pass before
publication. Browser fixture tests do not validate a real wallet or real chain transaction.
Acceptance requires a real testnet round trip on desktop and on a physical Android device,
including wallet rejection, account/network change, reconnection, interrupted submission,
same-amount repeat support, cross-project AP and dashboard reconciliation.

## References

- [Stellar wallet integration](https://developers.stellar.org/docs/tools/developer-tools/wallets)
- [Freighter desktop and mobile integration](https://github.com/stellar/freighter-developer-docs)
- [Stellar Asset Contract](https://developers.stellar.org/docs/tokens/stellar-asset-contract)
- [Contract authorization](https://developers.stellar.org/docs/build/guides/auth/contract-authorization)
- [Circle USDC on Stellar](https://www.circle.com/multi-chain-usdc/stellar)
- [Python Stellar SDK](https://stellar-sdk.readthedocs.io/en/latest/api.html)
