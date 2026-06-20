# Leafora Sui Browser Adapter

This folder is intentionally empty in the repository.

Leafora does not use npm or pnpm. To enable real browser wallet signing, add a
reviewed, pinned and hashed Sui SDK adapter here:

```text
apps/web/vendor/leafora-sui-sdk.js
```

The file must export:

```js
export async function supportProject({ config, walletSession, project, tier }) {
  // Build a Sui transaction with the official Sui TypeScript SDK.
  // Call:
  //   `${config.packageId}::${config.moduleName}::${config.supportFunction}`
  // Arguments:
  //   project.chain.projectId
  //   project.chain.vaultId
  //   split coin with tier.amountMist
  //   tier.chainTier
  //   tier.metadataUri
  // Sign and execute with walletSession.wallet.
  // Return:
  //   { digest: "..." }
}
```

Rules:

- use only official Mysten/Sui sources;
- pin exact versions;
- record SHA-256 hashes in `docs/security/vendor-manifest.md`;
- do not load SDK code from a CDN at runtime;
- do not add package-manager lockfiles or `node_modules`.
