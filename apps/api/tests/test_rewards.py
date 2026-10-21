import importlib
from contextlib import contextmanager
from types import SimpleNamespace

import httpx
import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool
from stellar_sdk import Keypair, Network

from app.api.deps import get_db
from app.api.routes import rewards
from app.core.config import settings
from app.db.base import Base
from app.models.reward import RewardBook, RewardEvent
from app.services import reward_ledger as ledger, reward_store as store, reward_chain

ISSUER, TREASURY, ALICE, BOB = [Keypair.from_raw_ed25519_seed(bytes([n]) * 32).public_key for n in (1, 2, 3, 4)]
U = ledger.UNIT
AT = "2026-10-02T12:00:00+00:00"
LATER = "2026-10-02T12:01:00+00:00"


@pytest.fixture
def db(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    monkeypatch.setattr(store, "timestamp", lambda: AT)
    with Session(engine, autoflush=False) as session:
        session.add(RewardBook(id=1, revision=0, head_hash=ledger.ZERO_HASH))
        session.commit()
        yield session
    engine.dispose()


def campaign(db, amount="1000", **kw):
    return rewards.create_campaign(rewards.CampaignRequest(id="beta", title="Beta", reserve="testers", amount=amount, rules="Manual review of unique activities.", **kw), db)


def award(db, wallet=ALICE, activity="feedback-1", amount="100"):
    return rewards.approve_award(rewards.AwardRequest(campaign="beta", wallet=wallet, activity=activity, amount=amount, reference="Private review reference"), db)


def legacy_event(db, key, kind, payload):
    """Build an old journal fixture; production append no longer accepts chain events."""
    book, state, _ = store.load(db)
    normalized = ledger.apply_event(state, kind, payload, AT)
    event = dict(sequence=book.revision + 1, key=key, kind=kind, payload=normalized,
                 recorded_at=AT, previous_hash=book.head_hash)
    head = ledger.digest(event)
    db.add(RewardEvent(**{**event, "payload": ledger.canonical(normalized), "event_hash": head}))
    book.revision += 1
    book.head_hash = head
    db.flush()


def epoch(db, name="cycle-1"):
    legacy_event(db, "epoch:" + name, "epoch", dict(id=name, issuer=ISSUER, treasury=TREASURY, anchor_ledger=100, anchor_hash="a" * 64))
    db.commit()
    return store.load(db)[1]["epochs"][name]


def snapshot(db, balances, name="cycle-1", sequence=101):
    payload = dict(epoch=name, ledger=sequence, ledger_hash="b" * 64, captured_at=LATER,
        issued_units=str(sum(balances.values())), balances={k: str(v) for k, v in balances.items()})
    legacy_event(db, f"snapshot:{name}:{sequence}", "snapshot", payload)
    db.commit()
    return payload


def receipt(a, **kw):
    data = dict(epoch="cycle-1", award=a["id"], tx_hash="c" * 64, operation="12345", ledger=102,
        ledger_hash="d" * 64, closed_at=LATER, proof=dict(type="payment", asset_code="LEAF",
        asset_issuer=ISSUER, **{"from": TREASURY, "to": a["wallet"]}, transaction_hash="c" * 64,
        id="12345", transaction_successful=True, amount="100.0000000"))
    data.update(kw)
    return data


def test_supply_is_exact_and_reserves_sum_to_billion(db):
    value = ledger.summary(store.load(db)[1])
    assert value["supply_units"] == "10000000000000000"
    assert sum(int(r["allocation_units"]) for r in value["reserves"]) == ledger.SUPPLY
    assert all(r["locked_units"] == "0" and r["unawarded_units"] == r["allocation_units"] for r in value["reserves"])


def test_idempotent_approval_exact_fraction_and_budget(db):
    campaign(db, "100.0000001")
    first = award(db)
    assert award(db) == first
    assert store.load(db)[0].revision == 2
    with pytest.raises(HTTPException, match="different data"):
        award(db, amount="99")
    award(db, activity="feedback-2", amount="0.0000001")
    with pytest.raises(HTTPException, match="insufficient"):
        award(db, wallet=BOB, amount="0.0000001")
    state = store.load(db)[1]
    assert ledger.wallet_statement(state, ALICE)["accumulated_units"] == "1000000001"
    assert len(state["awards"]) == 2


@pytest.mark.parametrize("amount", ["0", "-1", "1e2", "0.00000001", "50000000.0000001"])
def test_invalid_or_excessive_campaign(db, amount):
    with pytest.raises(HTTPException):
        campaign(db, amount)
    assert store.load(db)[0].revision == 0


def test_reserve_total_applies_across_campaigns(db):
    campaign(db, "50000000")
    with pytest.raises(HTTPException, match="reserve"):
        rewards.create_campaign(rewards.CampaignRequest(id="another", title="Another", reserve="testers", amount="1", rules="Reviewed"), db)
    with pytest.raises(HTTPException, match="reserve"):
        rewards.create_campaign(rewards.CampaignRequest(id="founders", title="Founders", reserve="founders", amount="1", rules="Reviewed"), db)


def test_cancellation_is_recorded_and_does_not_erase_receipts(db):
    campaign(db)
    a = award(db)
    rewards.cancel_award(ledger.Cancellation(award=a["id"], reason="Duplicate human review"), db)
    state = store.load(db)[1]
    assert state["awards"][a["id"]]["cancelled"]
    assert state["campaigns"]["beta"]["awarded_units"] == "0"
    assert award(db)["cancelled"]  # Same activity cannot silently become a new award.
    assert ledger.wallet_statement(state, ALICE)["awards"][0]["status"] == "cancelled"
    assert ledger.wallet_statement(state, ALICE)["accumulated_units"] == "0"
    b = award(db, activity="feedback-2")
    epoch(db)
    legacy_event(db, "payment", "receipt", receipt(b))
    db.commit()
    with pytest.raises(HTTPException, match="unpaid"):
        rewards.cancel_award(ledger.Cancellation(award=b["id"], reason="Wrong request"), db)


def test_legacy_testnet_payments_and_transfers_do_not_change_entitlements(db):
    campaign(db)
    a = award(db)
    epoch(db)
    legacy_event(db, "payment", "receipt", receipt(a))
    snapshot(db, {TREASURY: 900 * U, ALICE: 60 * U, BOB: 40 * U})
    original_events = store.export_book(db)["events"]
    public = ledger.wallet_statement(store.load(db)[1], ALICE)
    assert public["accumulated_units"] == public["locked_units"] == str(100 * U)
    assert public["available_units"] == public["mainnet_delivered_units"] == "0"
    assert public["awards"][0]["status"] == "locked"
    assert "reference" not in public["awards"][0]
    assert "tx_hash" not in public["awards"][0]
    assert "last_observed_balance" not in public
    assert ledger.wallet_statement(store.load(db)[1], BOB)["accumulated_units"] == "0"
    legacy_event(db, "close:cycle-1", "close_epoch", {"epoch": "cycle-1"})
    epoch(db, "cycle-2")
    assert award(db)["receipt"] is not None
    award(db, activity="new-action", amount="30")
    public = ledger.wallet_statement(store.load(db)[1], ALICE)
    assert public["accumulated_units"] == str(130 * U)
    assert store.export_book(db)["events"][:len(original_events)] == original_events


@pytest.mark.parametrize("field,value", [("asset_code", "USDC"), ("asset_issuer", BOB), ("from", BOB), ("to", BOB), ("amount", "99"), ("amount", None), ("transaction_hash", "e" * 64), ("id", "999"), ("transaction_successful", False)])
def test_receipt_must_match_exact_successful_operation(db, field, value):
    campaign(db)
    a = award(db)
    epoch(db)
    data = receipt(a)
    data["proof"][field] = value
    with pytest.raises(ValueError, match="does not match"):
        legacy_event(db, "bad-payment", "receipt", data)
    db.rollback()
    assert store.load(db)[1]["awards"][a["id"]]["receipt"] is None


def test_old_payments_and_operation_reuse_rejected(db):
    campaign(db)
    a, b = award(db), award(db, activity="feedback-2")
    epoch(db)
    with pytest.raises(ValueError, match="predates"):
        legacy_event(db, "old", "receipt", receipt(a, closed_at="2020-01-01T00:00:00Z"))
    db.rollback()
    legacy_event(db, "first", "receipt", receipt(a))
    db.commit()
    with pytest.raises(ValueError, match="already settled"):
        legacy_event(db, "second", "receipt", receipt(b))
    db.rollback()


def test_export_restore_roundtrip_and_nonempty_guard(db):
    campaign(db)
    award(db)
    document = store.export_book(db)
    original = ledger.wallet_statement(store.load(db)[1], ALICE)
    with pytest.raises(ValueError, match="empty"):
        store.restore_book(db, document, document["sha256"])
    db.rollback()
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    with Session(engine) as target:
        target.add(RewardBook(id=1, revision=0, head_hash=ledger.ZERO_HASH))
        target.commit()
        store.restore_book(target, document, document["sha256"])
        target.commit()
        assert ledger.wallet_statement(store.load(target)[1], ALICE) == original
    engine.dispose()


@pytest.mark.parametrize("corruption", ["checksum", "payload", "order", "truncated"])
def test_corrupt_backup_rejected(db, corruption):
    campaign(db)
    award(db)
    document = store.export_book(db)
    if corruption == "checksum":
        document["sha256"] = "f" * 64
    elif corruption == "payload":
        document["events"][1]["payload"]["amount_units"] = "1"
    elif corruption == "order":
        document["events"].reverse()
    else:
        document["events"].pop()
    if corruption != "checksum":
        document["sha256"] = ledger.digest({k: v for k, v in document.items() if k != "sha256"})
    with pytest.raises(ValueError):
        store.restore_book(db, document, document["sha256"])
    db.rollback()


def test_corrupt_database_blocks_new_writes(db):
    campaign(db)
    event = db.scalar(select(RewardEvent))
    event.payload = event.payload.replace("Beta", "Fake")
    db.commit()
    with pytest.raises(ValueError, match="integrity"):
        store.load(db)


def test_atomic_rollback_and_clock_guard(db, monkeypatch):
    campaign(db)
    monkeypatch.setattr(store, "timestamp", lambda: "2020-01-01T00:00:00Z")
    with pytest.raises(HTTPException, match="clock"):
        award(db)
    assert store.load(db)[0].revision == 1
    monkeypatch.setattr(store, "timestamp", lambda: AT)
    def broken_flush():
        raise RuntimeError("Simulated database failure")
    with monkeypatch.context() as local:
        local.setattr(db, "flush", broken_flush)
        with pytest.raises(RuntimeError):
            award(db)
        db.rollback()
    assert store.load(db)[0].revision == 1


def test_routes_auth_and_public_data(db, monkeypatch):
    monkeypatch.setattr(settings, "admin_token", "test-only-admin")
    app = FastAPI()
    app.include_router(rewards.router, prefix="/api/rewards")
    app.dependency_overrides[get_db] = lambda: db
    with TestClient(app) as client:
        assert client.get("/api/rewards/admin").status_code == 401
        assert client.get("/api/rewards/admin/export").status_code == 401
        response = client.get("/api/rewards/admin", headers={"X-Admin-Token": "test-only-admin"})
        assert response.status_code == 200
        assert response.json()["accounting"] == "offchain"
        assert response.json()["distribution_enabled"] is False
        assert response.headers["cache-control"] == "no-store"
        campaign(db)
        award(db)
        response = client.get("/api/rewards/wallets/" + ALICE)
        assert response.status_code == 200
        assert "Private review reference" not in response.text
        assert client.get("/api/rewards/wallets/not-a-wallet").status_code == 422
        assert client.post("/api/rewards/admin/awards", json={}).status_code == 401


def reader_data():
    tip = dict(sequence=101, hash="b" * 64)
    balance = dict(asset_code="LEAF", asset_issuer=ISSUER, balance="100.0000000")
    return {
        "/": {"network_passphrase": Network.TESTNET_NETWORK_PASSPHRASE},
        "/ledgers/100": {"hash": "a" * 64},
        "/ledgers": {"_embedded": {"records": [tip]}},
        "/assets": {"_embedded": {"records": [dict(asset_code="LEAF", asset_issuer=ISSUER,
            contracts_amount="0", claimable_balances_amount="0", liquidity_pools_amount="0",
            balances={"authorized": "100.0000000", "unauthorized": "0", "authorized_to_maintain_liabilities": "0"})]}},
        "/accounts": {"_embedded": {"records": [dict(account_id=ALICE, paging_token=ALICE, balances=[balance])]}},
    }


@contextmanager
def mocked_reader(data):
    def handle(request):
        value = data.get(request.url.path)
        return httpx.Response(404 if value is None else 200, json=value or {})
    with httpx.Client(base_url=reward_chain.HORIZON, transport=httpx.MockTransport(handle)) as client:
        yield reward_chain.TestnetReader(client)


def test_reader_reconciles_holders_and_supply(db):
    ep = epoch(db)
    with mocked_reader(reader_data()) as chain:
        value = chain.snapshot(ep)
    assert value["balances"] == {ALICE: str(100 * U)}
    assert value["issued_units"] == str(100 * U)


@pytest.mark.parametrize("problem", ["mainnet", "reset", "missing", "contract", "pool", "claimable", "partial", "supply"])
def test_reader_fails_closed_on_incomplete_or_unsupported_state(db, problem):
    ep, data = epoch(db), reader_data()
    asset = data["/assets"]["_embedded"]["records"][0]
    if problem == "mainnet": data["/"]["network_passphrase"] = Network.PUBLIC_NETWORK_PASSPHRASE
    elif problem == "reset": data["/ledgers/100"]["hash"] = "f" * 64
    elif problem == "missing": data["/assets"]["_embedded"]["records"] = []
    elif problem == "contract": asset["contracts_amount"] = "1"
    elif problem == "pool": asset["liquidity_pools_amount"] = "1"
    elif problem == "claimable": asset["claimable_balances_amount"] = "1"
    elif problem == "partial": data["/accounts"]["_embedded"]["records"] = []
    elif problem == "supply": asset["balances"]["authorized"] = "1000000001"
    with mocked_reader(data) as chain, pytest.raises(ValueError):
        chain.snapshot(ep)
    assert not store.load(db)[1]["snapshots"]


def test_snapshot_cannot_cross_ledgers(db):
    ep, data = epoch(db), reader_data()
    with mocked_reader(data) as chain:
        count = 0
        def changing_tip():
            nonlocal count
            count += 1
            return {"sequence": 100 + count, "hash": "b" * 64}
        chain.tip = changing_tip
        with pytest.raises(ValueError, match="advanced"):
            chain.snapshot(ep)


def test_checkpoint_never_contacts_testnet_even_with_legacy_cycles(db, monkeypatch, tmp_path):
    from app.rewards_admin import checkpoint
    ep = epoch(db)
    old = snapshot(db, {ALICE: 100 * U})
    def unavailable():
        pytest.fail("Locked reward accounting must not contact testnet")
    monkeypatch.setattr(reward_chain, "reader", unavailable)
    checkpoint(db, tmp_path)
    files = list(tmp_path.glob("*.leafora-rewards.json"))
    assert len(files) == 1
    assert store.load(db)[1]["snapshots"][ep["id"]] == old
    assert "cycle-1" in files[0].read_text()


def test_checkpoint_deduplicates_and_refuses_corruption(db, tmp_path):
    from app.rewards_admin import checkpoint
    campaign(db)
    first = checkpoint(db, tmp_path)
    assert checkpoint(db, tmp_path) == first
    assert len(list(tmp_path.iterdir())) == 1
    first.write_text("{}")
    with pytest.raises(ValueError, match="corrupt"):
        checkpoint(db, tmp_path)


def test_migration_seeds_book_and_guards_downgrade():
    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    migration = importlib.import_module("app.db.migrations.versions.0004_leaf_rewards")
    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()
            assert connection.execute(select(RewardBook.revision)).scalar_one() == 0
            with pytest.raises(RuntimeError, match="must not be dropped"):
                migration.downgrade()
    engine.dispose()


def test_cas_conflict_cannot_insert_event(db, monkeypatch):
    campaign(db)
    original = db.execute
    def conflict(statement, *args, **kwargs):
        if getattr(statement, "is_update", False):
            return SimpleNamespace(rowcount=0)
        return original(statement, *args, **kwargs)
    monkeypatch.setattr(db, "execute", conflict)
    with pytest.raises(HTTPException, match="concurrently"):
        award(db)
    assert store.load(db)[0].revision == 1


@pytest.mark.parametrize("path", ["/epochs", "/close-epoch", "/epochs/old/sync", "/receipts", "/recovery/old"])
def test_legacy_chain_routes_fail_closed(db, monkeypatch, path):
    monkeypatch.setattr(settings, "admin_token", "test-only-admin")
    app = FastAPI()
    app.include_router(rewards.router, prefix="/api/rewards")
    app.dependency_overrides[get_db] = lambda: db
    method = "GET" if path.startswith("/recovery/") else "POST"
    with TestClient(app) as client:
        assert client.request(method, "/api/rewards/admin" + path).status_code == 401
        result = client.request(method, "/api/rewards/admin" + path, headers={"X-Admin-Token": "test-only-admin"})
        assert result.status_code == 410
        assert "locked until launch" in result.json()["detail"]
    assert store.load(db)[0].revision == 0


def test_closed_campaign_and_checksum_validation(db):
    campaign(db)
    rewards.campaign_status(ledger.CampaignStatus(campaign="beta", open=False), db)
    with pytest.raises(HTTPException, match="closed"):
        award(db)
    with pytest.raises(ValueError):
        rewards.AwardRequest(campaign="beta", wallet="G" + "A" * 55, activity="feedback-1", amount="1", reference="Review")


def test_snapshot_cannot_overwrite_cutoff_or_break_supply(db):
    epoch(db)
    data = snapshot(db, {ALICE: 100 * U})
    for changed in ({"ledger": 99}, {"ledger_hash": "c" * 64}, {"ledger": 102, "issued_units": "1"}):
        with pytest.raises(ValueError):
            legacy_event(db, "bad-snapshot", "snapshot", {**data, **changed})
        db.rollback()
    assert store.load(db)[1]["snapshots"]["cycle-1"] == data


def test_verified_zero_is_valid_but_not_inferred_from_missing_data(db):
    ep, data = epoch(db), reader_data()
    data["/assets"]["_embedded"]["records"][0]["balances"]["authorized"] = "0"
    data["/accounts"]["_embedded"]["records"][0]["balances"][0]["balance"] = "0"
    with mocked_reader(data) as chain:
        value = chain.snapshot(ep)
    legacy_event(db, "zero-snapshot", "snapshot", value)
    db.commit()
    assert store.load(db)[1]["snapshots"]["cycle-1"]["balances"][ALICE] == "0"
    assert "last_observed_balance" not in ledger.wallet_statement(store.load(db)[1], ALICE)

@pytest.mark.parametrize("kind", ["epoch", "close_epoch", "snapshot", "receipt", "transfer", "claim", "release"])
def test_no_new_token_movement_or_release_can_be_written(db, kind):
    with pytest.raises(ValueError, match="locked until launch"):
        store.append(db, "attempt", kind, {})
    assert store.load(db)[0].revision == 0


def test_rewards_accumulate_across_multiple_resets_with_no_chain_dependency(db, monkeypatch):
    campaign(db)
    def unavailable(*args, **kwargs):
        pytest.fail("Reward accounting cannot depend on a resettable chain")
    monkeypatch.setattr(reward_chain, "reader", unavailable)
    amounts = ["100", "40", "30", "20", "0.0000001"]
    for index, amount in enumerate(amounts):
        if index in (2, 3):
            # The external network has reset; the committed journal is unchanged.
            prior = store.export_book(db)
            assert store.export_book(db)["events"] == prior["events"]
        first = award(db, activity=f"verified-action-{index}", amount=amount)
        assert award(db, activity=f"verified-action-{index}", amount=amount) == first
    state = store.load(db)[1]
    value = ledger.wallet_statement(state, ALICE)
    assert value["accumulated_units"] == value["locked_units"] == "1900000001"
    assert value["available_units"] == value["mainnet_delivered_units"] == "0"
    assert value["transferable"] is False
    assert value["distribution_enabled"] is False
    assert value["conversion"] == {"reward_units": "1", "token_units": "1"}
    rewards.campaign_status(ledger.CampaignStatus(campaign="beta", open=False), db)
    assert ledger.wallet_statement(store.load(db)[1], ALICE) == value
    rewards.campaign_status(ledger.CampaignStatus(campaign="beta", open=True), db)
    assert ledger.wallet_statement(store.load(db)[1], ALICE) == value


def test_v1_restore_preserves_cumulative_entitlements_and_allows_new_awards(db):
    campaign(db)
    a = award(db)
    epoch(db)
    legacy_event(db, "old-payment", "receipt", receipt(a))
    db.commit()
    document = store.export_book(db)
    document.pop("policy")
    document.update(format="leafora.rewards.v1", network="testnet")
    document["sha256"] = ledger.digest({k: v for k, v in document.items() if k != "sha256"})
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    with Session(engine, autoflush=False) as restored:
        restored.add(RewardBook(id=1, revision=0, head_hash=ledger.ZERO_HASH))
        restored.commit()
        store.restore_book(restored, document, document["sha256"])
        restored.commit()
        assert award(restored)["id"] == a["id"]
        award(restored, activity="after-reset", amount="0.0000001")
        value = ledger.wallet_statement(store.load(restored)[1], ALICE)
        assert value["accumulated_units"] == "1000000001"
        assert value["mainnet_delivered_units"] == "0"
        exported = store.export_book(restored)
        assert exported["format"] == "leafora.rewards.v2"
        assert exported["events"][:len(document["events"])] == document["events"]
    engine.dispose()


def test_allocation_manifest_is_complete_exact_deterministic_and_private(db):
    import json
    from fastapi import Response
    campaign(db)
    for index in range(201):
        award(db, wallet=ALICE if index % 2 else BOB, activity=f"activity-{index}", amount="0.0000001")
    cancelled = award(db, activity="incorrect", amount="10")
    rewards.cancel_award(ledger.Cancellation(award=cancelled["id"], reason="Private correction"), db)
    plan = json.loads(rewards.allocation_plan(db).body)
    assert plan == json.loads(rewards.allocation_plan(db).body)
    assert len(rewards.overview(Response(), db)["awards"]) == 200
    assert plan["total_units"] == "201"
    assert plan["wallets"] == sorted([
        {"wallet": ALICE, "amount_units": "100"},
        {"wallet": BOB, "amount_units": "101"}], key=lambda entry: entry["wallet"])
    assert plan["executes_transactions"] is False
    assert plan["distribution_enabled"] is False
    assert plan["sha256"] == ledger.digest({k: v for k, v in plan.items() if k != "sha256"})
    assert "Private" not in json.dumps(plan)
    award(db, activity="after-export", amount="1")
    assert json.loads(rewards.allocation_plan(db).body)["total_units"] == "10000201"
    with pytest.raises(ValueError):
        store.restore_book(db, plan, plan["sha256"])


def test_corrupt_prelaunch_policy_is_rejected_even_with_recomputed_checksum(db):
    campaign(db)
    document = store.export_book(db)
    document["policy"]["transferable"] = True
    document["sha256"] = ledger.digest({k: v for k, v in document.items() if k != "sha256"})
    with pytest.raises(ValueError, match="does not match"):
        store.restore_book(db, document, document["sha256"])
