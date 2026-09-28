#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, token, Address, BytesN, Env};

// USDC and AP share seven fractional digits. AP are non-transferable accounting units.
const SCALE: i128 = 1_000_000_000_000;
const LIMIT: i128 = 1_000_000_000_000_000_000;
const TTL: u32 = 518_400;
const THRESHOLD: u32 = 120_960;

#[contracttype]
#[derive(Clone)]
pub enum Key {
    Admin, Asset, Project(BytesN<32>), Position(BytesN<32>, Address), Total(Address),
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Project {
    pub metadata: BytesN<32>,
    pub goal: i128,
    pub deadline: u64,
    pub raised: i128,
    pub supporters: u64,
    pub paused: bool,
    pub revenue_enabled: bool,
    pub revenue_index: i128,
    pub revenue_funded: i128,
    pub revenue_claimed: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq, Default)]
pub struct Position {
    pub points: i128,
    pub index: i128,
    pub pending_scaled: i128,
    pub claimed: i128,
    pub nonce: u64,
}

#[contract]
pub struct Funding;

fn keep_alive(e: &Env) {
    e.storage().instance().extend_ttl(THRESHOLD, TTL);
}

fn admin(e: &Env) -> Address {
    keep_alive(e);
    let a: Address = e.storage().instance().get(&Key::Admin).unwrap();
    a.require_auth();
    a
}

fn asset(e: &Env) -> Address {
    e.storage().instance().get(&Key::Asset).unwrap()
}

fn project(e: &Env, id: &BytesN<32>) -> Project {
    keep_alive(e);
    let key = Key::Project(id.clone());
    let p = e.storage().persistent().get(&key).expect("unknown project");
    e.storage().persistent().extend_ttl(&key, THRESHOLD, TTL);
    p
}

fn save_project(e: &Env, id: &BytesN<32>, p: &Project) {
    let key = Key::Project(id.clone());
    e.storage().persistent().set(&key, p);
    e.storage().persistent().extend_ttl(&key, THRESHOLD, TTL);
}

fn position(e: &Env, id: &BytesN<32>, who: &Address) -> Position {
    let key = Key::Position(id.clone(), who.clone());
    if let Some(p) = e.storage().persistent().get(&key) {
        e.storage().persistent().extend_ttl(&key, THRESHOLD, TTL);
        p
    } else { Position::default() }
}

fn save_position(e: &Env, id: &BytesN<32>, who: &Address, p: &Position) {
    let key = Key::Position(id.clone(), who.clone());
    e.storage().persistent().set(&key, p);
    e.storage().persistent().extend_ttl(&key, THRESHOLD, TTL);
}

fn settle(p: &Project, s: &mut Position) {
    s.pending_scaled += s.points * (p.revenue_index - s.index);
    s.index = p.revenue_index;
}

#[contractimpl]
impl Funding {
    pub fn __constructor(e: Env, administrator: Address, usdc: Address) {
        assert_eq!(token::Client::new(&e, &usdc).decimals(), 7, "asset decimals");
        e.storage().instance().set(&Key::Admin, &administrator);
        e.storage().instance().set(&Key::Asset, &usdc);
        keep_alive(&e);
    }

    pub fn configuration(e: Env) -> (Address, Address) {
        keep_alive(&e);
        (e.storage().instance().get(&Key::Admin).unwrap(), asset(&e))
    }

    pub fn create(e: Env, id: BytesN<32>, metadata: BytesN<32>, goal: i128, deadline: u64) {
        admin(&e);
        assert!(goal > 0 && goal <= LIMIT, "invalid goal");
        assert!(deadline > e.ledger().timestamp(), "invalid deadline");
        assert!(metadata != BytesN::from_array(&e, &[0; 32]), "empty metadata");
        assert!(!e.storage().persistent().has(&Key::Project(id.clone())), "duplicate project");
        let p = Project { metadata, goal, deadline, raised: 0, supporters: 0, paused: false,
            revenue_enabled: false, revenue_index: 0, revenue_funded: 0, revenue_claimed: 0 };
        save_project(&e, &id, &p);
        e.events().publish((symbol_short!("created"), id), p);
    }

    pub fn get_project(e: Env, id: BytesN<32>) -> Option<Project> {
        keep_alive(&e);
        if e.storage().persistent().has(&Key::Project(id.clone())) { Some(project(&e, &id)) }
        else { None }
    }

    pub fn get_position(e: Env, id: BytesN<32>, who: Address) -> Position {
        let p = project(&e, &id);
        let mut s = position(&e, &id, &who);
        settle(&p, &mut s);
        s
    }

    pub fn wallet_total(e: Env, who: Address) -> i128 {
        keep_alive(&e);
        let key = Key::Total(who);
        if let Some(total) = e.storage().persistent().get(&key) {
            e.storage().persistent().extend_ttl(&key, THRESHOLD, TTL);
            total
        } else { 0 }
    }

    pub fn support(e: Env, id: BytesN<32>, who: Address, amount: i128, nonce: u64) {
        who.require_auth();
        let mut p = project(&e, &id);
        assert!(!p.paused && e.ledger().timestamp() < p.deadline, "funding closed");
        assert!(amount > 0 && amount <= LIMIT - p.raised, "invalid amount");
        let mut s = position(&e, &id, &who);
        // Sequential per-project nonce survives restarts without an unbounded receipt set.
        assert_eq!(nonce, s.nonce, "stale support nonce");
        settle(&p, &mut s);
        if s.points == 0 { p.supporters += 1; }
        let total = Self::wallet_total(e.clone(), who.clone()) + amount;
        assert!(total <= LIMIT, "wallet limit");
        s.points += amount;
        s.nonce += 1;
        p.raised += amount;
        token::Client::new(&e, &asset(&e)).transfer(&who, &e.current_contract_address(), &amount);
        save_project(&e, &id, &p);
        save_position(&e, &id, &who, &s);
        let key = Key::Total(who.clone());
        e.storage().persistent().set(&key, &total);
        e.storage().persistent().extend_ttl(&key, THRESHOLD, TTL);
        e.events().publish((symbol_short!("support"), id, who), (amount, nonce, p.raised));
    }

    pub fn pause(e: Env, id: BytesN<32>, paused: bool) {
        admin(&e);
        let mut p = project(&e, &id);
        p.paused = paused;
        save_project(&e, &id, &p);
        e.events().publish((symbol_short!("paused"), id), paused);
    }

    // Activation is per project and cannot remove already accrued claim rights.
    pub fn enable_revenue(e: Env, id: BytesN<32>) {
        admin(&e);
        let mut p = project(&e, &id);
        p.revenue_enabled = true;
        save_project(&e, &id, &p);
        e.events().publish((symbol_short!("revenue"), id), true);
    }

    pub fn fund_revenue(e: Env, id: BytesN<32>, amount: i128) {
        let a = admin(&e);
        let mut p = project(&e, &id);
        assert!(p.revenue_enabled && p.raised > 0, "revenue disabled");
        assert!(amount > 0 && amount <= LIMIT - p.revenue_funded, "invalid revenue");
        let increment = amount * SCALE / p.raised;
        assert!(increment > 0, "revenue below precision");
        token::Client::new(&e, &asset(&e)).transfer(&a, &e.current_contract_address(), &amount);
        p.revenue_index += increment;
        p.revenue_funded += amount;
        save_project(&e, &id, &p);
        e.events().publish((symbol_short!("income"), id), amount);
    }

    pub fn claim(e: Env, id: BytesN<32>, who: Address) -> i128 {
        who.require_auth();
        let mut p = project(&e, &id);
        let mut s = position(&e, &id, &who);
        settle(&p, &mut s);
        let amount = s.pending_scaled / SCALE;
        assert!(amount > 0, "nothing to claim");
        s.pending_scaled %= SCALE;
        s.claimed += amount;
        p.revenue_claimed += amount;
        assert!(p.revenue_claimed <= p.revenue_funded, "insufficient revenue");
        save_position(&e, &id, &who, &s);
        save_project(&e, &id, &p);
        token::Client::new(&e, &asset(&e)).transfer(&e.current_contract_address(), &who, &amount);
        e.events().publish((symbol_short!("claimed"), id, who), amount);
        amount
    }
}

#[cfg(test)]
mod test;
