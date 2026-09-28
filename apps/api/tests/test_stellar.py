from contextlib import contextmanager
from types import SimpleNamespace

import pytest
from fastapi import HTTPException, Response
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from stellar_sdk import Account, Asset, Keypair, Network, TransactionBuilder, scval

from app.api.routes import funding
from app.core.config import settings
from app.db.base import Base
from app.models.stellar_intent import StellarIntent
from app.services.stellar import Chain, amount_units, metadata_hash, project_id


@pytest.mark.parametrize("value,expected", [("1", 10_000_000), ("0.0000001", 1), ("100.25", 1_002_500_000), ("100000000000", 10**18)])
def test_amount_exact(value, expected):
    assert amount_units(value) == expected


@pytest.mark.parametrize("value", ["", "0", "0.0", "-1", "+1", "01", "1e2", "NaN", "Infinity", "1,25", "0.00000001", "100000000001", " 1"])
def test_invalid_amount(value):
    with pytest.raises(ValueError):
        amount_units(value)


def test_namespace_and_metadata_commitment():
    assert project_id("one") != project_id("two")
    from app.services.stellar import EDITORIAL_FIELDS
    p = SimpleNamespace(**{key: "example" for key in EDITORIAL_FIELDS})
    before = metadata_hash(p)
    p.objective = "changed"
    assert before != metadata_hash(p)


def test_sdk_address_decoding_is_checked(monkeypatch):
    admin = Keypair.random().public_key
    issuer = Keypair.random().public_key
    asset = Asset("USDC", issuer).contract_id(Network.TESTNET_NETWORK_PASSPHRASE)
    monkeypatch.setattr(settings, "stellar_admin", admin)
    client = Chain(SimpleNamespace(get_network=lambda: SimpleNamespace(passphrase="network")),
                   {"asset": asset, "passphrase": "network"})
    client.read = lambda *args: scval.to_native(scval.to_vec([scval.to_address(admin), scval.to_address(asset)]))
    client.verify_configuration()
    client.config["asset"] = Asset("OTHER", issuer).contract_id(Network.TESTNET_NETWORK_PASSPHRASE)
    with pytest.raises(HTTPException):
        client.verify_configuration()


@pytest.fixture
def intent_case(monkeypatch):
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    key = Keypair.random()
    contract = Asset.native().contract_id(Network.TESTNET_NETWORK_PASSPHRASE)
    envelope = (TransactionBuilder(Account(key.public_key, 0), Network.TESTNET_NETWORK_PASSPHRASE, 100)
                .append_invoke_contract_function_op(contract, "support", []).set_timeout(300).build())
    calls = []
    rpc = SimpleNamespace(get_transaction=lambda *a: SimpleNamespace(status=SimpleNamespace(value="NOT_FOUND")),
        send_transaction=lambda tx: calls.append(tx.hash_hex()) or SimpleNamespace(status=SimpleNamespace(value="PENDING")))
    client = SimpleNamespace(config={"contract": contract, "network": "testnet", "passphrase": Network.TESTNET_NETWORK_PASSPHRASE}, rpc=rpc)
    @contextmanager
    def fake_chain():
        yield client
    monkeypatch.setattr(funding, "chain", fake_chain)
    with Session(engine) as db:
        intent = StellarIntent(network="testnet", contract=contract, wallet=key.public_key, tx_hash=envelope.hash_hex(),
            xdr=envelope.to_xdr(), expires=envelope.transaction.preconditions.time_bounds.max_time)
        db.add(intent); db.commit()
        yield db, key, envelope, intent, calls, client
    engine.dispose()


def test_unsigned_envelope_cannot_be_submitted(intent_case):
    db, _, envelope, intent, calls, _ = intent_case
    with pytest.raises(HTTPException):
        funding.submit(intent.id, funding.SignedRequest(xdr=envelope.to_xdr()), db)
    assert calls == []


def test_wallet_cannot_replace_transaction_body(intent_case):
    db, key, envelope, intent, calls, _ = intent_case
    envelope.transaction.fee += 1
    envelope.sign(key)
    with pytest.raises(HTTPException):
        funding.submit(intent.id, funding.SignedRequest(xdr=envelope.to_xdr()), db)
    assert calls == []


def test_signed_exact_body_and_idempotent_confirmation(intent_case):
    db, key, envelope, intent, calls, client = intent_case
    envelope.sign(key)
    assert funding.submit(intent.id, funding.SignedRequest(xdr=envelope.to_xdr()), db)["status"] == "PENDING"
    client.rpc.get_transaction = lambda *args: SimpleNamespace(status=SimpleNamespace(value="SUCCESS"))
    assert funding.submit(intent.id, funding.SignedRequest(xdr=envelope.to_xdr()), db)["status"] == "SUCCESS"
    assert calls == [intent.tx_hash]


def test_no_cross_deployment_replay(intent_case):
    db, key, envelope, intent, calls, client = intent_case
    envelope.sign(key)
    client.config["network"] = "public"
    with pytest.raises(HTTPException):
        funding.submit(intent.id, funding.SignedRequest(xdr=envelope.to_xdr()), db)
    assert calls == []


def test_expiry_requires_rpc_history_coverage(intent_case):
    db, _, _, intent, _, client = intent_case
    response = SimpleNamespace(status=SimpleNamespace(value="NOT_FOUND"), ledger=None,
        oldest_ledger_close_time=intent.expires - 1000, latest_ledger_close_time=intent.expires + 1)
    client.rpc.get_transaction = lambda *a: response
    assert funding.transaction(intent.tx_hash, Response(), db)["status"] == "EXPIRED"
    response.oldest_ledger_close_time = intent.expires - 1
    assert funding.transaction(intent.tx_hash, Response(), db)["status"] == "NOT_FOUND"


def test_wrong_rpc_network_rejected_before_contract_read():
    client = Chain(SimpleNamespace(get_network=lambda: SimpleNamespace(passphrase="other")),
                   {"passphrase": Network.TESTNET_NETWORK_PASSPHRASE})
    with pytest.raises(HTTPException, match="RPC network"):
        client.verify_configuration()


def test_public_network_is_not_enabled_by_configuration_alone(monkeypatch):
    from app.services.stellar import public_config
    monkeypatch.setattr(settings, "stellar_network", "public")
    with pytest.raises(HTTPException, match="restricted to Stellar testnet"):
        public_config()


def test_pause_requires_api_admin_token(monkeypatch):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    app = FastAPI()
    app.include_router(funding.router)
    app.dependency_overrides[funding.get_db] = lambda: None
    monkeypatch.setattr(settings, "admin_token", "fixture-admin-token")
    with TestClient(app) as client:
        response = client.post("/projects/example/pause", json={
            "wallet": Keypair.random().public_key, "paused": True})
    assert response.status_code == 401


def test_pause_requires_admin_wallet_and_prepares_exact_boolean(monkeypatch):
    administrator = Keypair.random().public_key
    monkeypatch.setattr(settings, "stellar_admin", administrator)
    monkeypatch.setattr(funding, "get_project", lambda *args: object())
    with pytest.raises(HTTPException) as error:
        funding.prepare_pause("example", funding.PauseRequest(
            wallet=Keypair.random().public_key, paused=True), None)
    assert error.value.status_code == 403
    @contextmanager
    def fake_chain():
        yield object()
    monkeypatch.setattr(funding, "chain", fake_chain)
    monkeypatch.setattr(funding, "save_intent", lambda db, client, wallet, method, args: (wallet, method, args))
    for paused in (True, False):
        wallet, method, args = funding.prepare_pause("example", funding.PauseRequest(
            wallet=administrator, paused=paused), None)
        assert (wallet, method) == (administrator, "pause")
        assert scval.to_native(args[0]) == project_id("example")
        assert scval.to_native(args[1]) is paused


def test_metadata_endpoint_returns_exact_committed_utf8(monkeypatch):
    import hashlib
    import json
    from app.services.stellar import EDITORIAL_FIELDS, metadata
    project = SimpleNamespace(**{key: "regeneração" for key in EDITORIAL_FIELDS})
    monkeypatch.setattr(funding, "get_project", lambda *args: project)
    @contextmanager
    def fake_chain():
        yield SimpleNamespace(verify_configuration=lambda: None, config={"contract": "fixture", "network": "testnet"},
            project=lambda slug: {"metadata": metadata_hash(project), "goal": 1, "raised": 0,
                                  "deadline": 1, "supporters": 0, "paused": False})
    monkeypatch.setattr(funding, "chain", fake_chain)
    response = funding.published_metadata("example", None)
    assert json.loads(response.body) == metadata(project)
    assert hashlib.sha256(response.body).digest() == metadata_hash(project)
    assert response.headers["etag"] == '"' + metadata_hash(project).hex() + '"'
