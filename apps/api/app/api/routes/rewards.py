from contextlib import contextmanager
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import Field
from sqlalchemy.orm import Session
from stellar_sdk import StrKey

from app.api.deps import get_db, require_admin_token
from app.services import reward_ledger as ledger, reward_store as store
from app.services.stellar import amount_units

router = APIRouter()
admin = APIRouter(dependencies=[Depends(require_admin_token)])


class CampaignRequest(ledger.Data):
    id: ledger.Slug
    title: str = Field(min_length=1, max_length=160)
    reserve: str = "testers"
    amount: str = Field(min_length=1, max_length=24)
    rules: str = Field(min_length=1, max_length=4000)


class AwardRequest(ledger.Data):
    campaign: ledger.Slug
    wallet: ledger.Wallet
    activity: ledger.Slug
    amount: str = Field(min_length=1, max_length=24)
    reference: str = Field(min_length=1, max_length=500)


@contextmanager
def errors(db):
    try:
        yield
    except (ValueError, KeyError) as error:
        db.rollback()
        raise HTTPException(409, str(error) if isinstance(error, ValueError) else "Reward record not found.") from error


@router.get("/wallets/{wallet}")
def wallet_rewards(wallet: str, response: Response, db: Session = Depends(get_db)):
    if not StrKey.is_valid_ed25519_public_key(wallet):
        raise HTTPException(422, "Invalid wallet address.")
    response.headers["Cache-Control"] = "no-store"
    with errors(db):
        _, state, _ = store.load(db)
        return ledger.wallet_statement(state, wallet)


@admin.get("")
def overview(response: Response, db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = "no-store"
    with errors(db):
        book, state, _ = store.load(db)
        result = ledger.summary(state)
        result["revision"], result["head_hash"] = book.revision, book.head_hash
        result["awards"] = list(state["awards"].values())[-200:][::-1]
        return result


@admin.post("/campaigns")
def create_campaign(payload: CampaignRequest, db: Session = Depends(get_db)):
    with errors(db):
        data = payload.model_dump(exclude={"amount"})
        data["budget_units"] = str(amount_units(payload.amount))
        state = store.append(db, "campaign:" + payload.id, "campaign", data)
        db.commit()
        return state["campaigns"][payload.id]


@admin.post("/campaign-status")
def campaign_status(payload: ledger.CampaignStatus, db: Session = Depends(get_db)):
    with errors(db):
        state = store.append(db, "status:" + str(uuid4()), "campaign_status", payload.model_dump())
        db.commit()
        return state["campaigns"][payload.campaign]


@admin.post("/awards")
def approve_award(payload: AwardRequest, db: Session = Depends(get_db)):
    with errors(db):
        data = payload.model_dump(exclude={"amount"})
        data["amount_units"] = str(amount_units(payload.amount))
        identity = ledger.award_id(payload.campaign, payload.wallet, payload.activity)
        state = store.append(db, "award:" + identity, "award", data)
        db.commit()
        return state["awards"][identity]


@admin.post("/cancel")
def cancel_award(payload: ledger.Cancellation, db: Session = Depends(get_db)):
    with errors(db):
        state = store.append(db, "cancel:" + payload.award, "cancel", payload.model_dump())
        db.commit()
        return state["awards"][payload.award]


@admin.post("/epochs")
@admin.post("/close-epoch")
@admin.post("/epochs/{epoch_id}/sync")
@admin.post("/receipts")
@admin.get("/recovery/{epoch_id}")
def disabled_testnet_operations():
    raise HTTPException(410, "LEAF rewards are locked until launch. Testnet token operations are disabled.")


@admin.get("/export")
def export_rewards(db: Session = Depends(get_db)):
    with errors(db):
        document = store.export_book(db)
        return Response(ledger.canonical(document), media_type="application/json",
            headers={"Cache-Control": "no-store", "Content-Disposition": 'attachment; filename="backup.leafora-rewards.json"',
                     "X-Leafora-SHA256": document["sha256"]})


@admin.get("/allocations")
def allocation_plan(db: Session = Depends(get_db)):
    with errors(db):
        book, state, _ = store.load(db)
        document = ledger.allocation_manifest(state, book.revision, book.head_hash)
        return Response(ledger.canonical(document), media_type="application/json",
            headers={"Cache-Control": "no-store", "Content-Disposition": 'attachment; filename="allocations.leafora-rewards.json"',
                     "X-Leafora-SHA256": document["sha256"]})


router.include_router(admin, prefix="/admin")
