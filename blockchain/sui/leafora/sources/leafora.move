module leafora::leafora;
    use std::string::String;
    use sui::balance::{Self, Balance};
    use sui::coin::{Self, Coin};
    use sui::event;
    use sui::object::{Self, ID, UID};
    use sui::sui::SUI;
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};

    const STATUS_DRAFT: u8 = 0;
    const STATUS_ACTIVE: u8 = 1;
    const STATUS_PAUSED: u8 = 2;
    const STATUS_COMPLETED: u8 = 3;

    const MIST_PER_POINT: u64 = 100_000_000;
    const ACC_SCALE: u128 = 1_000_000_000;

    const E_PROJECT_NOT_ACTIVE: u64 = 1;
    const E_PROJECT_MISMATCH: u64 = 2;
    const E_PAYMENT_TOO_SMALL: u64 = 3;
    const E_NO_ALLOCATION_POINTS: u64 = 4;
    const E_NOTHING_TO_CLAIM: u64 = 5;
    const E_INVALID_FEE: u64 = 6;

    public struct AdminCap has key, store {
        id: UID,
    }

    public struct Project has key, store {
        id: UID,
        creator: address,
        metadata_uri: String,
        metadata_hash: vector<u8>,
        status: u8,
        verification_level: u8,
        funding_goal: u64,
        total_raised: u64,
        total_allocation_points: u64,
        acc_revenue_per_point: u128,
    }

    public struct ProjectVault has key, store {
        id: UID,
        project_id: ID,
        funding_balance: Balance<SUI>,
        future_revenue: Balance<SUI>,
        total_claimed: u64,
        platform_fee_bps: u64,
    }

    public struct SupporterNFT has key, store {
        id: UID,
        project_id: ID,
        tier: u8,
        contribution_amount: u64,
        allocation_points: u64,
        metadata_uri: String,
        created_by: address,
        reward_debt: u128,
        claimed_revenue: u64,
    }

    public struct EvidenceRecord has key, store {
        id: UID,
        project_id: ID,
        submitter: address,
        content_uri: String,
        content_hash: vector<u8>,
        metadata_hash: vector<u8>,
        geohash: vector<u8>,
        capture_timestamp_ms: u64,
        status: u8,
    }

    public struct ProjectCreated has copy, drop {
        project_id: ID,
        vault_id: ID,
        creator: address,
        funding_goal: u64,
    }

    public struct ProjectSupported has copy, drop {
        project_id: ID,
        supporter: address,
        nft_id: ID,
        amount: u64,
        allocation_points: u64,
        tier: u8,
    }

    public struct EvidenceSubmitted has copy, drop {
        project_id: ID,
        evidence_id: ID,
        submitter: address,
        status: u8,
    }

    public struct ProjectRevenueDeposited has copy, drop {
        project_id: ID,
        amount: u64,
        acc_revenue_per_point: u128,
    }

    public struct ProjectRevenueClaimed has copy, drop {
        project_id: ID,
        supporter: address,
        nft_id: ID,
        amount: u64,
    }

    public struct ProjectStatusChanged has copy, drop {
        project_id: ID,
        status: u8,
    }

    fun init(ctx: &mut TxContext) {
        transfer::transfer(AdminCap { id: object::new(ctx) }, tx_context::sender(ctx));
    }

    public entry fun create_project(
        _cap: &AdminCap,
        metadata_uri: String,
        metadata_hash: vector<u8>,
        funding_goal: u64,
        platform_fee_bps: u64,
        ctx: &mut TxContext,
    ) {
        assert!(platform_fee_bps <= 1_000, E_INVALID_FEE);

        let creator = tx_context::sender(ctx);
        let project = Project {
            id: object::new(ctx),
            creator,
            metadata_uri,
            metadata_hash,
            status: STATUS_ACTIVE,
            verification_level: 0,
            funding_goal,
            total_raised: 0,
            total_allocation_points: 0,
            acc_revenue_per_point: 0,
        };

        let project_id = object::uid_to_inner(&project.id);
        let vault = ProjectVault {
            id: object::new(ctx),
            project_id,
            funding_balance: balance::zero<SUI>(),
            future_revenue: balance::zero<SUI>(),
            total_claimed: 0,
            platform_fee_bps,
        };
        let vault_id = object::uid_to_inner(&vault.id);

        event::emit(ProjectCreated { project_id, vault_id, creator, funding_goal });
        transfer::share_object(project);
        transfer::share_object(vault);
    }

    public entry fun support_project(
        project: &mut Project,
        vault: &mut ProjectVault,
        payment: Coin<SUI>,
        tier: u8,
        metadata_uri: String,
        ctx: &mut TxContext,
    ) {
        let project_id = object::uid_to_inner(&project.id);
        assert!(vault.project_id == project_id, E_PROJECT_MISMATCH);
        assert!(project.status == STATUS_ACTIVE, E_PROJECT_NOT_ACTIVE);

        let supporter = tx_context::sender(ctx);
        let amount = coin::value(&payment);
        let allocation_points = amount / MIST_PER_POINT;
        assert!(allocation_points > 0, E_PAYMENT_TOO_SMALL);

        project.total_raised = project.total_raised + amount;
        project.total_allocation_points = project.total_allocation_points + allocation_points;
        balance::join(&mut vault.funding_balance, coin::into_balance(payment));

        let nft = SupporterNFT {
            id: object::new(ctx),
            project_id,
            tier,
            contribution_amount: amount,
            allocation_points,
            metadata_uri,
            created_by: supporter,
            reward_debt: project.acc_revenue_per_point,
            claimed_revenue: 0,
        };
        let nft_id = object::uid_to_inner(&nft.id);

        event::emit(ProjectSupported {
            project_id,
            supporter,
            nft_id,
            amount,
            allocation_points,
            tier,
        });
        transfer::public_transfer(nft, supporter);
    }

    public entry fun deposit_project_revenue(
        _cap: &AdminCap,
        project: &mut Project,
        vault: &mut ProjectVault,
        revenue: Coin<SUI>,
    ) {
        let project_id = object::uid_to_inner(&project.id);
        assert!(vault.project_id == project_id, E_PROJECT_MISMATCH);
        assert!(project.total_allocation_points > 0, E_NO_ALLOCATION_POINTS);

        let amount = coin::value(&revenue);
        let delta = ((amount as u128) * ACC_SCALE) / (project.total_allocation_points as u128);
        project.acc_revenue_per_point = project.acc_revenue_per_point + delta;
        balance::join(&mut vault.future_revenue, coin::into_balance(revenue));

        event::emit(ProjectRevenueDeposited {
            project_id,
            amount,
            acc_revenue_per_point: project.acc_revenue_per_point,
        });
    }

    public entry fun claim_project_revenue(
        project: &Project,
        vault: &mut ProjectVault,
        nft: &mut SupporterNFT,
        ctx: &mut TxContext,
    ) {
        let project_id = object::uid_to_inner(&project.id);
        assert!(vault.project_id == project_id, E_PROJECT_MISMATCH);
        assert!(nft.project_id == project_id, E_PROJECT_MISMATCH);

        let delta = project.acc_revenue_per_point - nft.reward_debt;
        let pending = ((nft.allocation_points as u128) * delta) / ACC_SCALE;
        let amount = pending as u64;
        assert!(amount > 0, E_NOTHING_TO_CLAIM);

        nft.reward_debt = project.acc_revenue_per_point;
        nft.claimed_revenue = nft.claimed_revenue + amount;
        vault.total_claimed = vault.total_claimed + amount;

        let payout = coin::from_balance(balance::split(&mut vault.future_revenue, amount), ctx);
        let supporter = tx_context::sender(ctx);
        let nft_id = object::uid_to_inner(&nft.id);
        transfer::public_transfer(payout, supporter);

        event::emit(ProjectRevenueClaimed {
            project_id,
            supporter,
            nft_id,
            amount,
        });
    }

    public entry fun submit_evidence(
        _cap: &AdminCap,
        project: &Project,
        content_uri: String,
        content_hash: vector<u8>,
        metadata_hash: vector<u8>,
        geohash: vector<u8>,
        capture_timestamp_ms: u64,
        ctx: &mut TxContext,
    ) {
        let submitter = tx_context::sender(ctx);
        let project_id = object::uid_to_inner(&project.id);
        let evidence = EvidenceRecord {
            id: object::new(ctx),
            project_id,
            submitter,
            content_uri,
            content_hash,
            metadata_hash,
            geohash,
            capture_timestamp_ms,
            status: 0,
        };
        let evidence_id = object::uid_to_inner(&evidence.id);

        event::emit(EvidenceSubmitted { project_id, evidence_id, submitter, status: 0 });
        transfer::public_transfer(evidence, submitter);
    }

    public entry fun set_project_status(
        _cap: &AdminCap,
        project: &mut Project,
        status: u8,
    ) {
        project.status = status;
        event::emit(ProjectStatusChanged {
            project_id: object::uid_to_inner(&project.id),
            status,
        });
    }

    public entry fun set_verification_level(
        _cap: &AdminCap,
        project: &mut Project,
        level: u8,
    ) {
        project.verification_level = level;
    }

    public fun status_draft(): u8 { STATUS_DRAFT }
    public fun status_active(): u8 { STATUS_ACTIVE }
    public fun status_paused(): u8 { STATUS_PAUSED }
    public fun status_completed(): u8 { STATUS_COMPLETED }
