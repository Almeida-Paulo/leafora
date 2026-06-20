from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_db, require_admin_token
from app.models.support import Support
from app.schemas.support import SupportCreate, SupportRead

router = APIRouter()


@router.get("/wallets/{wallet_address}/supports", response_model=list[SupportRead])
def list_wallet_supports(wallet_address: str, db: Session = Depends(get_db)) -> list[Support]:
    return list(
        db.scalars(
            select(Support)
            .where(Support.wallet_address == wallet_address)
            .order_by(Support.created_at.desc())
        )
    )


@router.post("/supports", response_model=SupportRead, dependencies=[Depends(require_admin_token)])
def create_support(payload: SupportCreate, db: Session = Depends(get_db)) -> Support:
    support = Support(**payload.model_dump())
    db.add(support)
    db.commit()
    db.refresh(support)
    return support

