# LEAF rewards: locked prelaunch entitlements

Status: local implementation, 2026-10-02; not deployed by this change.
The selected model records rewards against Stellar public wallet addresses in the
API database. No LEAF is minted or sent during testing. The dashboard shows earned
rewards, all locked until the official launch, with a 1:1 conversion to mainnet LEAF.

See [whitepaper/tokenomics](../whitepaper/leaf-tokenomics.md) for the product rules
and [operations and recovery](../operations/leaf-rewards.md) for rollout guidance.
The one-billion supply and allocation split below are the working tokenomics.
Campaign rules, budgets, recipients and amounts require administrative approval.
USDC support does not automatically earn LEAF; automatic activity validation and
reward rates have not been configured.

No mainnet transaction, issuer, trustline, sponsorship or paid RPC is necessary
for this reward accounting. Database storage and an off-host backup destination
must be configured and checked at deployment. Server loss is a separate risk from
testnet resets; a local export alone does not protect against server loss.

## Supply and allocation

| Allocation | Percent | LEAF |
| --- | ---: | ---: |
| Initial test participants | 5 | 50,000,000 |
| Future user incentives | 30 | 300,000,000 |
| Leafora treasury | 20 | 200,000,000 |
| Founders | 15 | 150,000,000 |
| Team and contributors | 10 | 100,000,000 |
| Community and integrations | 10 | 100,000,000 |
| Security and bug bounty | 5 | 50,000,000 |
| Strategic reserve | 5 | 50,000,000 |
| Total | 100 | 1,000,000,000 |

Use seven decimal places: supply is `10000000000000000` integer base units.
API amounts are decimal strings; Python integers and JavaScript BigInt avoid
rounding. Each validated reward consumes its campaign allocation once. Resets do
not replenish budgets, create supply or turn earlier credits into new rewards.

The founder schedule remains a proposal: 12-month cliff followed by 48 monthly
releases, start date undefined. Team grants require individual terms. Launch does
not automatically unlock all founder/team reserves; their vesting is separate
from the release of earned tester rewards. No vesting contract exists yet.

## Accounting and lock

The `reward_books` and `reward_events` tables from migration
`0004_leaf_rewards` are the source of truth. Each approval records its wallet,
campaign, activity, exact amount and private evidence reference. The service
commits the journal transaction before returning approval success.

Only campaign creation/status, awards and reasoned corrections can be appended.
There is no transfer, withdrawal, reassignment, issuance or release operation.
The lock is enforced by keeping entitlements in this ledger; it is not a claim of
frozen tokens in Freighter. There is no date-based or administrator UI unlock.
A separately reviewed mainnet release is required to deliver tokens.

Activity identity is campaign + wallet + activity. Retries preserve the original
identity and cannot credit twice. Campaign IDs must remain stable across resets.
A repeatable action needs a distinct validated action ID; a one-time action keeps
its original ID. Store transaction evidence and its network incarnation in the
private reference before approving on-chain activity; never approve an unconfirmed
transaction or infer an erased action after a reset.

Closing/reopening a campaign changes acceptance of new awards only. Corrections
retain the old approval and a cancellation event with a reason. The dashboard
shows cancelled rows without exposing private evidence/reasons. Do not cancel
valid rewards to reset a campaign or change reward rates retroactively.

```text
wallet_accumulated = sum(valid, non-cancelled awards for that wallet)
wallet_locked = wallet_accumulated
wallet_available_to_transfer = 0
reserve_unawarded = reserve_allocation - valid_awards
reserve_without_campaign = reserve_allocation - campaign_budgets
```

Historical testnet receipts/snapshots are retained and validated during replay.
They never subtract from an entitlement or create credit for a later transferee.
Legacy chain routes return HTTP 410, and the journal rejects new epoch, snapshot
and receipt writes. Legacy backup import is supported without rewriting events.
No active reward read, approval, backup or allocation export calls Horizon/RPC.

## Resets and recovery

100 + 40 LEAF before a reset remains 140. A new 30 LEAF reward yields 170.
Another reset keeps 170, and a new 20 yields 190. No snapshot summation or
token reconstruction is involved. Keep the same database, wallet address and
campaign identity throughout every cycle.

Backups contain all events, revision and chained hashes. New exports use
`leafora.rewards.v2` with the prelaunch policy; restore also accepts v1.
The `checkpoint` command exports each changed journal revision, even if testnet
is unavailable. An unchanged revision reuses its verified existing backup.
A reset is not a reason to restore an old database backup.

Keep encrypted copies and their checksums outside the API server, plus database
backups. Periodic export has a lag if the server is also lost. A requirement of
zero acknowledged-write loss needs appropriately operated durable replication;
the supplied timer does not provide that guarantee. Restore must be exercised on
an isolated database before rollout.

## Mainnet allocation manifest

The admin export and `rewards_admin allocations` produce an unsigned
`leafora.allocations.v1` manifest: sorted wallet totals, exact cumulative amount,
revision, journal head hash, supply, conversion policy and canonical checksum.
It contains all eligible wallets, not only the last 200 admin history rows.
Private references are excluded. Re-exporting a revision is deterministic.

The manifest is an audit artifact, not a payment queue or authorization to spend.
It does not freeze later approvals and must be reissued if the journal changes.
At launch, a separately approved cutoff must fix the eligible revision. All
payments, including partial deliveries and retries, must be reconciled against
that allocation and verified mainnet settlement records:

```text
mainnet_remaining = launch_entitlement - confirmed_mainnet_deliveries
```

Pending transactions must be reconciled before constructing replacement payments.
Testnet receipts never count as mainnet delivery. This release has no mainnet
settlement writer, signer, claim route or release switch; `mainnet_delivered_units`
is zero because mainnet distribution is disabled. Do not reuse this zero after
launch without adding verified settlement accounting.

Future mainnet asset identity, fixed-supply controls, signing, recipient onboarding,
vesting and optional result distributions require their own reviewed release.
No result percentage or launch date is committed. The funding API remains testnet;
do not change `LEAFORA_STELLAR_NETWORK` to issue LEAF.

## Archived mainnet cost study (not a deployment requirement)

The following study was recorded before the decision to keep rewards off-chain until launch. Do not buy XLM, sponsor wallets, configure mainnet accounts or deploy
mainnet contracts based on this appendix. Prices are historical observations.

### Live observations and pricing assumptions

Read-only queries completed at 2026-10-01 19:22:16 UTC:

| Observation | Value |
| --- | --- |
| Mainnet ledger | 64,719,350 |
| Ledger close time | 2026-10-01 19:22:12 UTC |
| Base reserve | 5,000,000 stroops = 0.5 XLM |
| Minimum classic fee per operation | 100 stroops = 0.00001 XLM |
| Horizon observed fee_charged p50 | 100 stroops |
| Horizon observed fee_charged p95 | 84,037 stroops |
| Indicative Coinbase rate, XLM/USD | 0.22003 |
| Indicative Coinbase rate, XLM/BRL | 1.1491763511666666 |

The fee percentiles are observations, not a promised future fee. Cost examples
below use the minimum classic fee and separately identify reserves. Re-query fees
before signing; congestion, fee bumps and smart-contract execution can cost more.
Currency conversions are indicative, exclude exchange spreads/withdrawal charges,
and are not executable quotes. Parameters can change through network governance.

## Initial network capital

A classic account requires 1 XLM; a LEAF trustline adds 0.5 XLM. Each additional
signer adds 0.5 XLM. A 2-of-3 multisig budget here assumes three additional signer
entries with the master key disabled, not three separately activated accounts.

| Configuration | Reserve XLM | Approx. BRL |
| --- | ---: | ---: |
| Issuer + one distribution account and its LEAF trustline, no multisig | 2.5 | 2.87 |
| Issuer + one treasury with LEAF trustline and three signer entries | 4 | 4.60 |
| Above + one limited distribution account with LEAF trustline | 5.5 | 6.32 |
| Issuer + eight allocation accounts, each with LEAF trustline and three signers, plus one limited distribution account | 26.5 | 30.45 |
| Optional single checkpoint entry | +0.5 | +0.57 |

The single-treasury layout separates allocation budgets in accounting, not in
separate on-chain accounts. Prefer eight allocation accounts when publicly visible
segregation is required. Signers and custody arrangements must be selected before
launch; three keys controlled on the same compromised device are not independent
custody. A limited operational account is for capped batches, not the full supply.

Allow roughly 20 XLM (USD 4.40 / BRL 22.98) for the compact layout, or 50 XLM
(USD 11.00 / BRL 57.46) for separately funded allocation accounts and a fee buffer.
These are proposed startup budgets, not fees, not approvals to spend, and do not
cover recipient sponsorship, custom contracts, hardware or professional review.

Reserves are normally immobilized capital, not transaction fees. They may be
released only when eligible entries are removed or sponsorship is transferred.
Treat the locked issuer's minimum XLM as permanently unavailable after issuer lock.
There is no need to buy collateral worth one billion LEAF, provide a liquidity pool
or spend USDC merely to issue the asset. More token units do not require more asset
issuance operations.

## Recipient costs

The same public address can be used on both networks, but testnet account activation
and test XLM do not activate or fund that address on mainnet. Before delivery, the
user must authorize a LEAF trustline for the correct mainnet issuer.

| Recipient state | Additional reserve per recipient |
| --- | ---: |
| Active mainnet account already trusting this LEAF issuer | 0 XLM |
| Active mainnet account needing a LEAF trustline | 0.5 XLM |
| No active mainnet account and no LEAF trustline | 1.5 XLM |

One ordinary classic payment has a minimum fee of 0.00001 XLM. The table below
shows only reserve capital, excluding account/trustline setup fees, payment fees
and the platform's initial accounts.

| Recipients | Existing accounts: trustlines only | New accounts + trustlines | Approx. BRL for new accounts |
| --- | ---: | ---: | ---: |
| 100 | 50 XLM | 150 XLM | 172.38 |
| 1,000 | 500 XLM | 1,500 XLM | 1,723.76 |
| 10,000 | 5,000 XLM | 15,000 XLM | 17,237.65 |

For 1,000 already-prepared recipients, 1,000 classic payment operations have a
minimum combined fee of 0.01 XLM; this excludes onboarding and congestion. The
network's per-transaction operation limit still applies to batching.

The reserve is paid either by the user or by a sponsor. Sponsorship moves the
requirement to the sponsor; it does not remove it and requires the participant's
authorization. Fee sponsorship is a separate concern. Prefer a capped pilot and
on-demand onboarding for actual recipients, not automatic sponsorship for every
new registration. The budget must not assume unlimited free mainnet wallets.

## Deferred components and launch gates

- No custom token contract, staking or corporate-result distribution is needed to
  preserve the definitive asset through testnet resets. Do not deploy them yet.
- Enforced vesting, autonomous claims and future distribution contracts need their
  own implementation, review, mainnet simulation, deployment and state-maintenance
  budget. The startup figures above do not include those mechanisms.
- Existing server/database resources can host campaign accounting; off-host backup
  capacity, retention and recovery testing need verification. No new VPS, paid RPC
  or recurring infrastructure price is assumed or quoted here.
- Mainnet signing must explicitly show mainnet, LEAF issuer, amount and operation;
  never silently switch a project-support transaction to mainnet. Testnet rewards
  approvals and mainnet settlement need separate configuration and confirmation.
- Finalize asset identity/domain, ownership of signing keys, campaign obligations,
  recipient onboarding policy and a spending limit before publishing any promise
  of rewards or signing real transactions. No launch command is authorized here.

## Sources

- [Live ledger](https://horizon.stellar.org/ledgers?order=desc&limit=1)
- [Live fee observations](https://horizon.stellar.org/fee_stats)
- [Indicative exchange rates](https://api.coinbase.com/v2/exchange-rates?currency=XLM)
- [Accounts and subentry reserves](https://developers.stellar.org/docs/learn/fundamentals/stellar-data-structures/accounts)
- [Fees and resource metering](https://developers.stellar.org/docs/learn/fundamentals/fees-resource-limits-metering)
- [Sponsored reserves](https://developers.stellar.org/docs/build/guides/transactions/sponsored-reserves)
- [Asset design and supply controls](https://developers.stellar.org/docs/tokens/control-asset-access)
- [SAC administration](https://developers.stellar.org/docs/build/guides/tokens/custom-sac-admin)
- [Classic assets and contract tokens](https://developers.stellar.org/docs/tokens/anatomy-of-an-asset)
- [Networks and resets](https://developers.stellar.org/docs/networks)
- [Manage Data](https://developers.stellar.org/docs/data/apis/horizon/api-reference/resources/operations/object/manage-data)
- [Contract state archival](https://developers.stellar.org/docs/learn/fundamentals/contract-development/storage/state-archival)
