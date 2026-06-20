from datetime import datetime

from pydantic import BaseModel, ConfigDict


class EvidenceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    title: str
    content_uri: str
    content_hash: str
    metadata_hash: str
    geohash: str
    latitude: str
    longitude: str
    capture_timestamp: datetime | None
    status: str
    submitter_address: str
    sui_object_id: str
    sui_tx_digest: str
    created_at: datetime
    updated_at: datetime


class EvidenceCreate(BaseModel):
    project_id: str
    title: str
    content_uri: str
    content_hash: str
    metadata_hash: str = ""
    geohash: str = ""
    latitude: str = ""
    longitude: str = ""
    capture_timestamp: datetime | None = None
    submitter_address: str = ""


class EvidenceReview(BaseModel):
    status: str
    sui_object_id: str = ""
    sui_tx_digest: str = ""

