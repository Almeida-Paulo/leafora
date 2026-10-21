# LEAF reward operations

## Scope

This release accumulates locked prelaunch rewards in the existing API PostgreSQL
database. No LEAF asset, wallet funding, chain synchronization or signing secret
is needed. Apply migration `0004_leaf_rewards` if it has not been applied.
No further migration or new package is required for the locked-reward change.
Deploy admin, web assets and API together. Rust recompilation is not needed.

Reward balances are rights to 1:1 LEAF delivery at official launch, not spendable
testnet tokens. The one-billion supply and reserve budgets are accounting limits,
not evidence of on-chain issuance. Mainnet delivery is disabled.

## Approvals

1. Configure the administrative session and open LEAF.
2. Create a campaign with its permanent ID, title, reserve, budget and explicit
   activity rules. No campaign/rate is invented by the application.
3. Validate an activity, its wallet and evidence before approving its exact LEAF
   amount. A USDC payment must be confirmed before treating it as evidence.
4. Use the same campaign/wallet/activity ID on retries, including after resets.
   Use a distinct verified action ID for repeatable actions. For a one-time action,
   preserve the ID across all testnet cycles. Do not recreate a campaign each reset.
5. The dashboard shows the total accumulated and locked, zero available to
   transfer, a 1:1 launch conversion and approval history.
6. An incorrect approval can be cancelled with a recorded reason. The original
   remains visible, marked cancelled; private reasons stay administrative.
   An approval with a legacy testnet receipt cannot be cancelled through this UI.
   Closing/reopening a campaign neither deletes rewards nor replenishes budgets.

Automatic activity validation/reward crediting remains unconfigured. Manual
approval is the active mechanism. Historical validation references must be
preserved before testnet history disappears.

Only testers/users/community/security reserves accept campaigns. Founder, team,
treasury and strategic allocations remain outside this approval workflow.
A reserve's allocation minus valid awards is its unawarded balance, including
amounts already budgeted to campaigns. Allocation minus campaign budgets is the
amount with no campaign. Neither column is a blockchain wallet balance.

## Backups

Run commands from `apps/api`, using its virtualenv and the server environment
file. No command prints signing secrets or submits transactions.

```bash
python -m app.rewards_admin audit
```

Create a portable export with exclusive file creation:

```bash
python -m app.rewards_admin export --output /var/lib/leafora/reward-backups/manual.leafora-rewards.json
```

The checksum covers canonical JSON excluding `sha256`, not pretty-printed file
bytes. Retain the checksum in a separate trusted location. Backups contain private
review references: restrict access, encrypt off-host copies and keep them out of
Git and public web directories.

The `infra/systemd/leafora-rewards-checkpoint.*` templates are not installed by
the source change. At deployment, check the service paths, environment and
ownership of `/var/lib/leafora/reward-backups` (leafora, mode 0700).

```bash
python -m app.rewards_admin checkpoint --directory /var/lib/leafora/reward-backups
```

The timer runs after each minute of inactivity, without overlapping its own job.
Each changed revision creates a new export; unchanged revisions reuse their
verified file. It does not contact the blockchain, even if an imported journal
contains old testnet cycles. Corrupt existing files cause failure, not overwrite.
Monitor failures, disk growth and restore limits; retention needs an explicit policy.

Configure and test an independent encrypted off-host copy and database backups.
None is deployed by this change. Minute-based local exports cannot guarantee zero
loss if the entire server is lost before copying. Such a requirement needs durable
replication configured to protect acknowledged database commits. Verify the chosen
recovery objective before accepting public rewards.

## Testnet reset

Keep the current reward database and the same wallet/campaign identities. No
reward-specific reset command, new issuer, cycle or balance snapshot is needed.
New valid awards add to all earlier valid awards.

Never restore an older database just because testnet reset. Never add a snapshot
balance to the ledger, re-credit old activities, copy accumulated totals into new
awards or reset campaign budgets. Project funding test contracts may need separate
recreation; that process must leave the reward journal untouched.

For an old deployment, disable old token-distribution scripts as part of rollout.
The legacy epoch, sync, receipt and recovery API routes now return HTTP 410.
The CLI no longer exposes `sync`. New chain event writes are blocked in the store.
Legacy records remain in backups/replay for audit, but testnet payments do not
reduce mainnet entitlements and transferred test tokens do not create entitlements.

## Disaster recovery

Restore only into an empty reward ledger with migration `0004_leaf_rewards`
applied, using the checksum from the independent backup record:

```bash
python -m app.rewards_admin restore --input /secure/path/backup.leafora-rewards.json --expected-sha256 VERIFIED_HASH
```

Restore validates ordering, event hashes, amounts and budgets before commit.
Formats v1 and v2 are accepted. Import limits remain 64 MiB / 100,000 events;
review these limits before approaching them. Hash chaining detects damage against
independently retained exports, not dishonest rewrites by an operator controlling
the database and all backups. Never downgrade/drop the reward tables.

## Allocation review before launch

The admin button **Exportar saldos por carteira** downloads all valid wallet
totals, including wallets outside the most recent 200 approval rows. CLI equivalent:

```bash
python -m app.rewards_admin allocations --output /var/lib/leafora/reward-backups/allocations.leafora-rewards.json
```

This unsigned manifest contains wallet amounts, cumulative total, revision,
journal hash and checksum. It is not a backup and cannot be restored as one.
It neither locks a cutoff nor executes payments. New approvals/corrections require
a new manifest. At launch, approve the exact cutoff and implement independently
verified mainnet settlement with duplicate-payment protection before distribution.
Do not treat legacy testnet receipts as definitive delivery.

## Verification boundaries

Focused local checks use SQLite and mocked network responses, not the deployed
PostgreSQL service. They cover exact sums, duplicate requests, multiple reset
boundaries, old-record replay, backup restoration, budgets and blocked chain routes.
Live server backup/replication, wallet ownership, automatic activity attribution
and mainnet settlement still need their own verification and configuration.

Local validation on 2026-10-02 for this revision:

- `pytest tests/test_rewards.py tests/test_stellar.py -q`: 94 passed. Existing
  dependency deprecation warnings remain; SQLite and mocked network data were used.
- Playwright with intercepted APIs: locked totals, exact fractional approvals,
  backup and allocation downloads, session clearing, error states, stale wallet
  responses, disconnect and PT/EN passed. Rewards remained usable during a mocked
  funding API outage. Desktop, 390 px and 320 px screenshots were inspected.
- No live chain transaction, server deployment or off-host backup was performed.
