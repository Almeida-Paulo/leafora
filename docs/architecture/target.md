# Leafora Target Architecture

This is the intended architecture from the beginning. Development can happen in
stages, but the stages should add missing components rather than replace the
core model.

## Chain

Primary chain:

```text
Sui
```

Reasons:

- object model fits projects, vaults, supporter NFTs and evidence records;
- low transaction cost;
- Move resource model is a strong fit for asset/state safety;
- devnet is practical for early tests.

Future chains can be added through adapters, but Sui is the first-class path.

## Core On-Chain Model

```text
Project
ProjectVault
SupporterNFT
EvidenceRecord
conditional future claim accounting
```

The current Move module already follows this model. Later work should harden,
test and audit it, not replace the domain structure.

## Web App

The frontend is a Sui dApp:

- Sui Wallet Standard discovery;
- legacy injected Sui fallback;
- wallet disclaimer before connection;
- explicit devnet/mainnet state;
- project marketplace;
- project detail;
- support tiers;
- supporter dashboard;
- evidence registry;
- evidence capture preparation.

The frontend can later move to React/TypeScript if we approve a controlled
dependency policy, but the wallet/domain boundaries should remain the same.

## Transaction Layer

Transaction construction lives behind:

```text
apps/web/vendor/leafora-sui-sdk.js
```

This is not a throwaway boundary. It is the permanent adapter between Leafora UI
and official Sui SDK transaction construction.

## Backend

Backend is not required to support the first static devnet test, but it is part
of the target product:

- Python/FastAPI API;
- PostgreSQL + PostGIS;
- Sui event indexer;
- project admin;
- evidence upload orchestration;
- IPFS/Walrus/Arweave storage records;
- validator queue;
- audit trail;
- optional KYB/KYC only when third-party project creation opens.

## Evidence System

Target evidence package:

```text
image/document
SHA-256 content hash
metadata hash
geolocation
device/app signature
capture timestamp
storage URI
on-chain anchor
human/remote review status
satellite/auditor references when available
```

Images and documents remain off-chain. Hashes, metadata commitments and evidence
state go on-chain.

## Product Guardrails

- support, not guaranteed investment return;
- allocation points, not APY;
- conditional future claims only when revenue is actually deposited;
- evidence registry, not certified carbon credit issuance;
- curated project launch until anti-fraud and compliance systems exist.

## What Should Not Be Replaced Later

- Sui object model;
- project/vault/supporter/evidence domain model;
- wallet-standard connection boundary;
- evidence hash/on-chain anchor strategy;
- conservative legal language.

## What Can Evolve Later

- static frontend to React/TypeScript;
- Sui-only to multi-chain adapters;
- manual evidence review to validator marketplace;
- curated-only projects to verified third-party launchpad;
- devnet to mainnet;
- public RPC to dedicated RPC/indexer.
