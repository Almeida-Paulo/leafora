# Wallet Integration

Leafora supports wallet connection in the browser and keeps transaction signing
behind one reviewed adapter:

```text
apps/web/vendor/leafora-sui-sdk.js
```

This prevents the application from depending on `npm install`, `pnpm install`,
remote CDN imports or large unaudited dependency trees at deploy time.

## Reference App Review

The repository `Almeida-Paulo/Web3-Interface` uses RainbowKit, Wagmi and Viem.
That is a good EVM wallet UX pattern, but it is not a Sui connector. Leafora
reuses the product pattern:

- disclaimer before opening a wallet;
- explicit network/account state;
- refusal when network/configuration is wrong;
- no fake dashboard entry after a failed transaction.

Leafora does not import RainbowKit/Wagmi because the first chain target is Sui,
not EVM, and because that stack depends on a pnpm/npm dependency tree.

## Frontend Flow

1. User clicks `Conectar Sui wallet`.
2. The app opens a testnet disclaimer.
3. `apps/web/assets/js/sui-devnet.js` lists wallet-standard and legacy injected Sui wallets.
4. User accepts the disclaimer and chooses a wallet.
5. User chooses a tier and accepts project risk disclosure.
6. The app checks:
   - `packageId`;
   - project object ID;
   - vault object ID;
   - wallet supports Sui devnet;
   - local Sui adapter.
7. The adapter builds and signs `support_project`.
8. Only a returned transaction digest is stored in the dashboard.

## Adapter Contract

The adapter must export:

```js
export async function supportProject({ config, walletSession, project, tier }) {
  return { digest: "..." };
}
```

Input shape:

```js
{
  config: {
    chain: "sui:devnet",
    packageId: "0x...",
    moduleName: "leafora",
    supportFunction: "support_project",
    defaultGasBudgetMist: "50000000"
  },
  walletSession: {
    kind: "wallet-standard" | "legacy",
    wallet,
    account,
    address: "0x..."
  },
  project: {
    chain: {
      projectId: "0x...",
      vaultId: "0x..."
    }
  },
  tier: {
    chainTier: 0,
    metadataUri: "ipfs://...",
    amountMist: "5000000000"
  }
}
```

The Sui Move call target is:

```text
<packageId>::leafora::support_project
```

Arguments:

```text
project object
vault object
coin split from wallet gas/payment coin
tier.chainTier
tier.metadataUri
```

## Refusal Behavior

If configuration or adapter files are missing, the UI must show the exact
reason and must not add a fake support entry to the dashboard.

## Final Architecture Decision

The wallet boundary is not temporary. The final browser architecture is:

```text
Leafora UI
  Sui Wallet Standard discovery
  legacy injected Sui fallback
  project/support/evidence UX

Leafora Sui adapter
  official Mysten/Sui SDK code, pinned and vendored
  transaction construction
  wallet signing

Sui devnet/mainnet
  Move package
  shared Project and ProjectVault objects
  SupporterNFT objects
  EvidenceRecord objects
```

The adapter implementation can be updated when Sui SDK APIs evolve, but the
application contract between the UI and signing layer is the intended long-term
boundary.
