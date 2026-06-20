# Vendor Manifest

Leafora currently ships without third-party browser bundles.

When a dependency is vendored manually, add one row before deploy:

| File | Source | Version | SHA-256 | Review notes |
| --- | --- | --- | --- | --- |
| _none_ | _none_ | _none_ | _none_ | No vendored runtime dependency yet. |

## Required For Wallet Signing

Real Sui devnet wallet signing requires:

```text
apps/web/vendor/leafora-sui-sdk.js
```

That adapter must be built from official Mysten/Sui sources, pinned to an exact
version and reviewed before use. The frontend will refuse to sign project
support transactions until this file exists and exports `supportProject`.
