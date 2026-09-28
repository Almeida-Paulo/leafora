# Vendor Manifest

The Stellar wallet flow ships fixed local browser bundles. No package manager or
package lifecycle script is executed to install them. Archive SHA-512, individual
file SHA-256, entrypoint SRI and license sources are recorded in
[`stellar-vendor.json`](stellar-vendor.json). Public and admin copies must match.

When a dependency is vendored manually, add one row before deploy:

| File | Source | Version | SHA-256 | Review notes |
| --- | --- | --- | --- | --- |
| `stellar/freighter.js` | Official `@stellar/freighter-api` package | 6.0.1 | See JSON manifest | Desktop extension API; Apache-2.0 upstream license. |
| `stellar/walletconnect.js` | Official `@walletconnect/sign-client` package | 2.25.0 | See JSON manifest | WalletConnect Community License; not MIT. |
| `stellar/walletconnect-modal.js` and local chunks | Official `@walletconnect/modal` package | 2.7.0 | See JSON manifest | QR/deep-link selector; Apache-2.0 upstream license. |

The acquisition script extracts allowlisted bundle paths from SHA-512-verified
archives without executing them. WalletConnect still depends on external relay,
verification and directory services at runtime. Hash verification establishes
artifact identity, not absence of vulnerabilities. These bundles have not received
an independent security audit. Commercial deployment requires review of the
WalletConnect license and service terms, provider limits and allowed domains.

## Required For Wallet Signing

Legacy Sui devnet wallet signing would require:

```text
apps/web/vendor/leafora-sui-sdk.js
```

That adapter must be built from official Mysten/Sui sources, pinned to an exact
version and reviewed before use. The frontend will refuse to sign project
support transactions until this file exists and exports `supportProject`.
The current public funding flow does not load that adapter: Stellar constructs
unsigned transactions on the backend and signs through the vendored wallet APIs.
