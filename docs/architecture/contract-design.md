# Leafora Sui Contract Design

This is the first devnet-oriented Move implementation for Leafora. It is still
unaudited and must not be used with real funds.

## Current Module

```text
leafora::leafora
```

Source:

```text
blockchain/sui/leafora/sources/leafora.move
```

## Objects

### AdminCap

Owned by the deployer during `init`. It gates curated actions in the controlled release:

- project creation;
- evidence submission;
- project status changes;
- verification level changes;
- future revenue deposits.

### Project

Shared object. External supporters can reference it in transactions.

Fields:

- `creator`;
- `metadata_uri`;
- `metadata_hash`;
- `status`;
- `verification_level`;
- `funding_goal`;
- `total_raised`;
- `total_allocation_points`;
- `acc_revenue_per_point`.

### ProjectVault

Shared object paired with one `Project`.

Fields:

- `project_id`;
- `funding_balance`;
- `future_revenue`;
- `total_claimed`;
- `platform_fee_bps`.

### SupporterNFT

Owned object minted to a supporter when `support_project` succeeds.

Fields:

- `project_id`;
- `tier`;
- `contribution_amount`;
- `allocation_points`;
- `metadata_uri`;
- `created_by`;
- `reward_debt`;
- `claimed_revenue`.

### EvidenceRecord

Owned record created by curated evidence submission.

Fields:

- `project_id`;
- `submitter`;
- `content_uri`;
- `content_hash`;
- `metadata_hash`;
- `geohash`;
- `capture_timestamp_ms`;
- `status`.

## Core Calls

### `create_project`

Admin-only. Creates a shared `Project` and a shared `ProjectVault`.

### `support_project`

Public. Receives SUI, updates project totals, deposits funds into the vault and
mints a `SupporterNFT`.

Allocation points are derived on-chain:

```text
allocation_points = payment_mist / 100_000_000
```

This means one allocation point currently equals 0.1 SUI in devnet units.

### `deposit_project_revenue`

Admin-only. Deposits actual future revenue into the vault if the project has
allocation points. This updates a cumulative revenue index.

### `claim_project_revenue`

Public. A holder of a `SupporterNFT` can claim proportional revenue only after
revenue is actually deposited.

Formula:

```text
claimable = allocation_points * (project.acc_revenue_per_point - nft.reward_debt)
```

The index uses fixed-point scaling internally. This is a technical capability,
not a promise of return.

### `submit_evidence`

Admin-only in the controlled release. Anchors a content-addressed evidence package by URI, hash
and geohash. This avoids spam and fake third-party submissions while the
validator workflow is not ready.

### `set_project_status`

Admin-only. Allows pausing or completing a project.

### `set_verification_level`

Admin-only. Updates the public validation level for the project.

## Status Values

```text
0 = draft
1 = active
2 = paused
3 = completed
```

## Why Objects Are Shared

`Project` and `ProjectVault` are shared because supporters need to call
`support_project` from their own wallet. If these objects were owned by the
creator, external supporters could not mutate them in normal Sui transactions.

## Safety Controls

- admin-only project creation during controlled release;
- no public project launch yet;
- shared project/vault IDs must match;
- inactive projects reject support;
- tiny payments that produce zero allocation points are rejected;
- future revenue claims only exist after actual deposits;
- evidence submission is curated until the capture/validator app exists;
- all important flows emit events.

## Before Mainnet

- compile and publish on devnet;
- write Move unit tests;
- run Sui CLI smoke tests;
- add event indexer;
- add upgrade/migration plan;
- review economic model;
- audit contract;
- complete legal/compliance review before marketing revenue features.
