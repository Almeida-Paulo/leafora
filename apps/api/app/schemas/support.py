from datetime import datetime

from pydantic import BaseModel, ConfigDict


class SupportRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    wallet_address: str
    tier: str
    amount_mist: int
    allocation_points: int
    sui_tx_digest: str
    supporter_nft_id: str
    created_at: datetime
    updated_at: datetime


class SupportCreate(BaseModel):
    project_id: str
    wallet_address: str
    tier: str
    amount_mist: int
    allocation_points: int
    sui_tx_digest: str
    supporter_nft_id: str = ""

