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
from app.services.stellar import Chain, amount_units, committed_metadata_version, funding_read, metadata_hash, project_id


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
    p.image_uri = "/assets/img/first.png"
    before = metadata_hash(p)
    old_hash = metadata_hash(p, include_image=True)
    assert committed_metadata_version(p, before) == "v2"
    assert committed_metadata_version(p, old_hash) == "v1"
    p.image_uri = "/assets/img/next.png"
    assert metadata_hash(p) == before
    assert metadata_hash(p, include_image=True) != old_hash
    p.objective = "changed"
    assert before != metadata_hash(p)


def test_new_cover_can_change_but_legacy_cover_stays_committed(monkeypatch):
    from app.api.routes import projects as project_routes
    from app.schemas.project import ProjectUpdate
    from app.services.stellar import LEGACY_EDITORIAL_FIELDS
    project = SimpleNamespace(**{key: "example" for key in LEGACY_EDITORIAL_FIELDS})
    project.slug = "one"
    project.image_uri = "/assets/img/first.png"
    db = SimpleNamespace(commit=lambda: None, refresh=lambda _: None)
    monkeypatch.setattr(project_routes, "_get_project_by_slug", lambda *args: project)
    monkeypatch.setattr(settings, "stellar_contract", "fixture-contract")
    chain_hash = metadata_hash(project)

    @contextmanager
    def fake_chain():
        yield SimpleNamespace(project=lambda slug: {"metadata": chain_hash})

    monkeypatch.setattr("app.services.stellar.chain", fake_chain)
    project_routes.update_project("one", ProjectUpdate(image_uri="/assets/img/next.png"), db)
    assert project.image_uri == "/assets/img/next.png"
    chain_hash = metadata_hash(project, include_image=True)
    with pytest.raises(HTTPException, match="committed on-chain"):
        project_routes.update_project("one", ProjectUpdate(image_uri="/assets/img/third.png"), db)
    assert project.image_uri == "/assets/img/next.png"


def test_published_funding_reads_both_metadata_versions():
    from app.services.stellar import LEGACY_EDITORIAL_FIELDS
    project = SimpleNamespace(**{key: "example" for key in LEGACY_EDITORIAL_FIELDS})
    project.slug = "one"
    chain_hash = metadata_hash(project)
    chain_client = SimpleNamespace(config={"contract": "fixture", "network": "testnet"},
        project=lambda slug: {"metadata": chain_hash, "goal": 10_000_000, "raised": 0,
                              "deadline": 9_999_999_999, "supporters": 0, "paused": False})
    assert funding_read(chain_client, project)["metadata_version"] == "v2"
    chain_hash = metadata_hash(project, include_image=True)
    assert funding_read(chain_client, project)["metadata_version"] == "v1"
    project.objective = "changed"
    with pytest.raises(HTTPException, match="does not match"):
        funding_read(chain_client, project)


def test_public_evidence_filters_review_and_hides_precise_location(monkeypatch):
    from app.api.routes import evidence as evidence_routes
    from app.models.evidence import EvidenceRecord
    from app.models.project import Project
    from app.schemas.evidence import EvidencePublicRead
    @contextmanager
    def fake_chain():
        yield object()
    monkeypatch.setattr(evidence_routes, "chain", fake_chain)
    monkeypatch.setattr(evidence_routes, "funding_read", lambda *args: {"id": "published"})
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        project = Project(slug="one", name="Project", category="Restoration", biome="Forest",
            location_label="General region", objective="Objective", impact_summary="Impact",
            story="Story", risks="Risks", funding_goal_mist=0)
        db.add(project)
        db.flush()
        db.add_all([
            EvidenceRecord(project_id=project.id, title="Approved", content_uri="private://original",
                content_hash="a" * 64, geohash="very-precise-location", latitude="-23.5",
                longitude="-46.6", status="approved", submitter_address="private-operator"),
            EvidenceRecord(project_id=project.id, title="Pending", content_uri="private://pending",
                content_hash="b" * 64, status="pending"),
        ])
        db.commit()
        rows = evidence_routes.list_project_evidence("one", db)
        assert [row.title for row in rows] == ["Approved"]
        public = EvidencePublicRead.model_validate(rows[0]).model_dump()
        assert not {"latitude", "longitude", "geohash", "content_uri", "submitter_address"} & public.keys()
        monkeypatch.setattr(evidence_routes, "funding_read", lambda *args: None)
        with pytest.raises(HTTPException, match="Project not published"):
            evidence_routes.list_project_evidence("one", db)
    engine.dispose()


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


def test_publish_requires_approved_complete_project(monkeypatch):
    from app.services.stellar import LEGACY_EDITORIAL_FIELDS
    project = SimpleNamespace(**{key: "example" for key in LEGACY_EDITORIAL_FIELDS})
    project.slug = "one"
    project.image_uri = "/assets/img/illustration.png"
    project.status = "draft"
    project.milestones = [SimpleNamespace(title="First step")]
    administrator = Keypair.random().public_key
    monkeypatch.setattr(settings, "stellar_admin", administrator)
    monkeypatch.setattr(funding, "get_project", lambda *args: project)
    payload = funding.PublishRequest(wallet=administrator, amount="12", deadline=9_999_999_999)
    with pytest.raises(HTTPException, match="Approve the project"):
        funding.prepare_publish("one", payload, None)
    project.status = "active"
    project.image_uri = ""
    with pytest.raises(HTTPException, match="Complete the project"):
        funding.prepare_publish("one", payload, None)
    project.image_uri = "ipfs://example"
    with pytest.raises(HTTPException, match="public site path or an HTTPS URL"):
        funding.prepare_publish("one", payload, None)

    project.image_uri = "/assets/img/illustration.png"
    @contextmanager
    def fake_chain():
        yield object()
    monkeypatch.setattr(funding, "chain", fake_chain)
    monkeypatch.setattr(funding, "save_intent", lambda db, client, wallet, method, args: (method, args))
    method, args = funding.prepare_publish("one", payload, None)
    assert method == "create"
    assert scval.to_native(args[1]) == metadata_hash(project)


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
    project.image_uri = "/assets/img/illustration.png"
    monkeypatch.setattr(funding, "get_project", lambda *args: project)
    chain_hash = metadata_hash(project)
    @contextmanager
    def fake_chain():
        yield SimpleNamespace(verify_configuration=lambda: None, config={"contract": "fixture", "network": "testnet"},
            project=lambda slug: {"metadata": chain_hash, "goal": 1, "raised": 0,
                                  "deadline": 1, "supporters": 0, "paused": False})
    monkeypatch.setattr(funding, "chain", fake_chain)
    response = funding.published_metadata("example", None)
    assert json.loads(response.body) == metadata(project)
    assert hashlib.sha256(response.body).digest() == metadata_hash(project)
    assert response.headers["etag"] == '"' + metadata_hash(project).hex() + '"'
    assert "image_uri" not in json.loads(response.body)
    chain_hash = metadata_hash(project, include_image=True)
    legacy_response = funding.published_metadata("example", None)
    assert json.loads(legacy_response.body) == metadata(project, include_image=True)
    assert hashlib.sha256(legacy_response.body).digest() == chain_hash
