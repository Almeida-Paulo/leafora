use super::*;
use soroban_sdk::testutils::{Address as _, Ledger};

fn fixture() -> (Env, Address, Address, Address, Address, BytesN<32>) {
    let e = Env::default();
    e.mock_all_auths();
    let admin = Address::generate(&e);
    let alice = Address::generate(&e);
    let bob = Address::generate(&e);
    let asset = e.register_stellar_asset_contract_v2(admin.clone()).address();
    let token = token::StellarAssetClient::new(&e, &asset);
    for user in [&admin, &alice, &bob] { token.mint(user, &10_000_000_000); }
    let contract = e.register(Funding, (&admin, &asset));
    let id = BytesN::from_array(&e, &[1; 32]);
    FundingClient::new(&e, &contract).create(&id, &BytesN::from_array(&e, &[2; 32]), &1_000_000, &1000);
    (e, contract, asset, alice, bob, id)
}

#[test]
fn repeated_amounts_oversubscription_and_global_total() {
    let (e, contract, asset, alice, _, id) = fixture();
    let c = FundingClient::new(&e, &contract);
    c.support(&id, &alice, &2_500_001, &0);
    c.support(&id, &alice, &2_500_001, &1);
    assert_eq!(c.get_position(&id, &alice).points, 5_000_002);
    assert_eq!(c.get_project(&id).unwrap().supporters, 1);
    let other = BytesN::from_array(&e, &[3; 32]);
    c.create(&other, &BytesN::from_array(&e, &[4; 32]), &1, &1000);
    c.support(&other, &alice, &1, &0);
    assert_eq!(c.wallet_total(&alice), 5_000_003);
    assert_eq!(token::Client::new(&e, &asset).balance(&contract), 5_000_003);
}

#[test]
fn stale_nonce_cannot_pay_twice() {
    let (e, contract, asset, alice, _, id) = fixture();
    let c = FundingClient::new(&e, &contract);
    c.support(&id, &alice, &100, &0);
    assert!(c.try_support(&id, &alice, &100, &0).is_err());
    assert_eq!(c.wallet_total(&alice), 100);
    assert_eq!(token::Client::new(&e, &asset).balance(&contract), 100);
}

#[test]
fn zero_negative_and_insufficient_balance_are_atomic() {
    let (e, contract, _, alice, _, id) = fixture();
    let c = FundingClient::new(&e, &contract);
    for amount in [0, -1, 10_000_000_001] {
        assert!(c.try_support(&id, &alice, &amount, &0).is_err());
    }
    assert_eq!(c.wallet_total(&alice), 0);
    assert_eq!(c.get_project(&id).unwrap().raised, 0);
}

#[test]
fn deadline_and_pause_enforced_on_chain() {
    let (e, contract, _, alice, _, id) = fixture();
    let c = FundingClient::new(&e, &contract);
    c.pause(&id, &true);
    assert!(c.try_support(&id, &alice, &1, &0).is_err());
    c.pause(&id, &false);
    e.ledger().with_mut(|ledger| ledger.timestamp = 999);
    c.support(&id, &alice, &1, &0);
    e.ledger().with_mut(|ledger| ledger.timestamp = 1000);
    assert!(c.try_support(&id, &alice, &1, &1).is_err());
}

#[test]
fn revenue_disabled_by_default_and_new_points_do_not_receive_old_income() {
    let (e, contract, asset, alice, bob, id) = fixture();
    let c = FundingClient::new(&e, &contract);
    c.support(&id, &alice, &100, &0);
    assert!(c.try_fund_revenue(&id, &100).is_err());
    c.enable_revenue(&id);
    c.fund_revenue(&id, &100);
    c.support(&id, &bob, &100, &0);
    c.support(&id, &alice, &100, &1);
    assert!(c.try_claim(&id, &bob).is_err());
    assert_eq!(c.claim(&id, &alice), 100);
    assert!(c.try_claim(&id, &alice).is_err());
    c.fund_revenue(&id, &300);
    assert_eq!(c.claim(&id, &alice), 200);
    assert_eq!(c.claim(&id, &bob), 100);
    assert_eq!(token::Client::new(&e, &asset).balance(&contract), 300);
}

#[test]
fn fractional_revenue_is_carried_not_rounded_up() {
    let (e, contract, asset, alice, bob, id) = fixture();
    let c = FundingClient::new(&e, &contract);
    c.support(&id, &alice, &1, &0);
    c.support(&id, &bob, &2, &0);
    c.enable_revenue(&id);
    for _ in 0..3 { c.fund_revenue(&id, &1); }
    assert!(c.try_claim(&id, &alice).is_err());
    assert_eq!(c.claim(&id, &bob), 1);
    c.fund_revenue(&id, &1);
    assert_eq!(c.claim(&id, &alice), 1);
    assert_eq!(c.claim(&id, &bob), 1);
    assert!(token::Client::new(&e, &asset).balance(&contract) >= 3);
}

#[test]
fn invalid_or_duplicate_projects_rejected() {
    let (e, contract, _, _, _, id) = fixture();
    let c = FundingClient::new(&e, &contract);
    let metadata = BytesN::from_array(&e, &[2; 32]);
    assert!(c.try_create(&id, &metadata, &1, &1000).is_err());
    let new_id = BytesN::from_array(&e, &[9; 32]);
    assert!(c.try_create(&new_id, &metadata, &0, &1000).is_err());
    assert!(c.try_create(&new_id, &metadata, &1, &0).is_err());
}

#[test]
fn unauthenticated_calls_rejected() {
    let (e, contract, _, alice, _, id) = fixture();
    e.mock_auths(&[]);
    let c = FundingClient::new(&e, &contract);
    assert!(c.try_support(&id, &alice, &1, &0).is_err());
    assert!(c.try_pause(&id, &true).is_err());
    assert!(c.try_enable_revenue(&id).is_err());
}
