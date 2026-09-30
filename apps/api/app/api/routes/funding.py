import time
import json
from urllib.parse import urlsplit
from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from stellar_sdk import TransactionEnvelope, StrKey, scval

from app.api.deps import get_db, require_admin_token
from app.models.project import Project
from app.models.evidence import EvidenceRecord
from app.models.stellar_intent import StellarIntent
from app.services.stellar import amount_units, chain, funding_read, metadata, metadata_hash, project_id, public_config
from app.core.config import settings

router = APIRouter()


class SupportRequest(BaseModel):
    wallet: str = Field(pattern=r"^G[A-Z2-7]{55}$")
    amount: str = Field(min_length=1, max_length=24)


class PublishRequest(SupportRequest):
    deadline: int = Field(gt=0)


class PauseRequest(BaseModel):
    wallet: str = Field(pattern=r"^G[A-Z2-7]{55}$")
    paused: bool = Field(strict=True)


class SignedRequest(BaseModel):
    xdr: str = Field(min_length=32, max_length=100_000)


def get_project(db, slug):
    project = db.scalar(select(Project).where(Project.slug == slug))
    if project is None:
        raise HTTPException(404, "Project not found.")
    return project


def parse_amount(value):
    try:
        return amount_units(value)
    except ValueError as error:
        raise HTTPException(422, str(error)) from error


def save_intent(db, client, wallet, method, args):
    active = db.scalar(select(func.count()).select_from(StellarIntent).where(
        StellarIntent.wallet == wallet, StellarIntent.expires > int(time.time())))
    if active >= 5:
        raise HTTPException(429, "Too many pending requests. Wait for them to expire.")
    envelope = client.prepare(wallet, method, args)
    tx_hash = envelope.hash_hex()
    intent = db.scalar(select(StellarIntent).where(StellarIntent.tx_hash == tx_hash))
    if intent is None:
        intent = StellarIntent(network=client.config["network"], contract=client.config["contract"],
            wallet=wallet, tx_hash=tx_hash, xdr=envelope.to_xdr(),
            expires=envelope.transaction.preconditions.time_bounds.max_time)
        db.add(intent)
        db.commit()
    return {"id": intent.id, "xdr": intent.xdr, "hash": intent.tx_hash,
            "expires": intent.expires, "network": client.config["passphrase"],
            "fee_stroops": str(envelope.transaction.fee)}


@router.get("/config")
def config(response: Response):
    response.headers["Cache-Control"] = "no-store"
    return public_config()


@router.get("/projects")
def catalog(response: Response, db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = "no-store"
    with chain() as client:
        client.verify_configuration()
        result = []
        evidence_counts = dict(db.execute(select(EvidenceRecord.project_id, func.count())
            .where(EvidenceRecord.status == "approved").group_by(EvidenceRecord.project_id)).all())
        for project in db.scalars(select(Project).order_by(Project.created_at)):
            funding = funding_read(client, project)
            if funding is not None:
                result.append({**metadata(project), "image_uri": project.image_uri, "image_kind": "illustration",
                    "evidence_count": evidence_counts.get(project.id, 0), "funding": funding, "milestones": [
                    {"title": m.title, "description": m.description, "status": m.status}
                    for m in project.milestones]})
        return result


@router.get("/wallets/{wallet}")
def portfolio(wallet: str, response: Response, db: Session = Depends(get_db)):
    if not StrKey.is_valid_ed25519_public_key(wallet):
        raise HTTPException(422, "Invalid wallet address.")
    response.headers["Cache-Control"] = "no-store"
    with chain() as client:
        client.verify_configuration()
        rows = []
        for project in db.scalars(select(Project).order_by(Project.created_at)):
            funding = funding_read(client, project)
            if funding is None:
                continue
            position = client.position(project.slug, wallet)
            if position["points"] > 0:
                rows.append({"slug": project.slug, "name": project.name, "image": project.image_uri,
                    "points_units": str(position["points"]), "project_points_units": funding["points_units"],
                    "nonce": str(position["nonce"]), "funding": funding})
        total = client.read("wallet_total", [scval.to_address(wallet)])
        return {"wallet": wallet, "points_units": str(total), "positions": rows,
                "network": client.config["network"], "contract": client.config["contract"]}


@router.get("/projects/{slug}/metadata")
def published_metadata(slug: str, db: Session = Depends(get_db)):
    project = get_project(db, slug)
    with chain() as client:
        client.verify_configuration()
        funding = funding_read(client, project)
        if funding is None:
            raise HTTPException(404, "Project is not published.")
        legacy = funding["metadata_version"] == "v1"
        committed = metadata(project, include_image=legacy)
        digest = metadata_hash(project, include_image=legacy)
        return Response(json.dumps(committed, ensure_ascii=False, sort_keys=True, separators=(",", ":")),
            media_type="application/json", headers={"Cache-Control": "no-cache",
            "ETag": '"' + digest.hex() + '"'})


@router.post("/projects/{slug}/prepare")
def prepare_support(slug: str, payload: SupportRequest, db: Session = Depends(get_db)):
    project = get_project(db, slug)
    with chain() as client:
        funding = funding_read(client, project)
        if not funding or not funding["open"]:
            raise HTTPException(409, "This project is not accepting support.")
        position = client.position(slug, payload.wallet)
        return save_intent(db, client, payload.wallet, "support", [scval.to_bytes(project_id(slug)),
            scval.to_address(payload.wallet), scval.to_int128(parse_amount(payload.amount)),
            scval.to_uint64(position["nonce"])])


@router.post("/projects/{slug}/publish", dependencies=[Depends(require_admin_token)])
def prepare_publish(slug: str, payload: PublishRequest, db: Session = Depends(get_db)):
    project = get_project(db, slug)
    if project.status != "active":
        raise HTTPException(422, "Approve the project in the editorial panel before publishing it.")
    required_fields = ("name", "category", "biome", "country", "location_label", "image_uri",
                       "objective", "impact_summary", "story", "risks")
    missing = [field for field in required_fields if not str(getattr(project, field) or "").strip()]
    if missing or not project.milestones:
        raise HTTPException(422, "Complete the project presentation, cover image and at least one milestone before publishing.")
    image_uri = project.image_uri.strip()
    parsed = urlsplit(image_uri)
    if not ((image_uri.startswith("/") and not image_uri.startswith("//")) or
            (parsed.scheme == "https" and parsed.hostname and not parsed.username and not parsed.password)):
        raise HTTPException(422, "The cover image must use a public site path or an HTTPS URL.")
    if payload.wallet != settings.stellar_admin:
        raise HTTPException(403, "Connect the contract administrator wallet.")
    if payload.deadline <= int(time.time()):
        raise HTTPException(422, "Closing time must be in the future.")
    with chain() as client:
        return save_intent(db, client, payload.wallet, "create", [scval.to_bytes(project_id(slug)),
            scval.to_bytes(metadata_hash(project)), scval.to_int128(parse_amount(payload.amount)),
            scval.to_uint64(payload.deadline)])


@router.post("/projects/{slug}/pause", dependencies=[Depends(require_admin_token)])
def prepare_pause(slug: str, payload: PauseRequest, db: Session = Depends(get_db)):
    get_project(db, slug)
    if payload.wallet != settings.stellar_admin:
        raise HTTPException(403, "Connect the contract administrator wallet.")
    with chain() as client:
        return save_intent(db, client, payload.wallet, "pause", [
            scval.to_bytes(project_id(slug)), scval.to_bool(payload.paused)])


@router.post("/intents/{intent_id}/submit")
def submit(intent_id: str, payload: SignedRequest, db: Session = Depends(get_db)):
    intent = db.get(StellarIntent, intent_id)
    if intent is None:
        raise HTTPException(404, "Signing request not found.")
    with chain() as client:
        if (intent.contract, intent.network) != (client.config["contract"], client.config["network"]):
            raise HTTPException(409, "Signing request belongs to another deployment.")
        try:
            signed = TransactionEnvelope.from_xdr(payload.xdr, client.config["passphrase"])
        except Exception as error:
            raise HTTPException(422, "Invalid signed envelope.") from error
        if signed.hash_hex() != intent.tx_hash or not signed.signatures:
            raise HTTPException(409, "Wallet changed the authorized transaction or did not sign it.")
        existing = client.rpc.get_transaction(intent.tx_hash)
        if existing.status.value in ("SUCCESS", "FAILED"):
            return {"hash": intent.tx_hash, "status": existing.status.value}
        if intent.expires < int(time.time()):
            raise HTTPException(409, "Signing request expired. Check its hash before creating another support.")
        result = client.rpc.send_transaction(signed)
        if result.status.value == "ERROR":
            raise HTTPException(409, "Network rejected the transaction. Check wallet balance and sequence.")
        return {"hash": intent.tx_hash, "status": result.status.value}


@router.get("/transactions/{tx_hash}")
def transaction(tx_hash: str, response: Response, db: Session = Depends(get_db)):
    import re
    if not re.fullmatch(r"[a-f0-9]{64}", tx_hash):
        raise HTTPException(422, "Invalid transaction hash.")
    response.headers["Cache-Control"] = "no-store"
    with chain() as client:
        result = client.rpc.get_transaction(tx_hash)
        status = result.status.value
        intent = db.scalar(select(StellarIntent).where(StellarIntent.tx_hash == tx_hash))
        # NOT_FOUND alone is ambiguous. Expiry is definitive only if RPC history covers
        # the entire signing window and a ledger has closed beyond its maxTime.
        if (status == "NOT_FOUND" and intent and intent.network == client.config["network"]
                and intent.contract == client.config["contract"]
                and int(result.oldest_ledger_close_time) <= intent.expires - 300
                and int(result.latest_ledger_close_time) > intent.expires):
            status = "EXPIRED"
        return {"hash": tx_hash, "status": status, "ledger": result.ledger}
