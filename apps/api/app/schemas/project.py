from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ProjectRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    slug: str
    name: str
    category: str
    biome: str
    country: str
    region: str
    location_label: str
    objective: str
    impact_summary: str
    story: str
    risks: str
    status: str
    verification_level: int
    funding_goal_mist: int
    raised_mist: int
    sui_package_id: str
    sui_project_id: str
    sui_vault_id: str
    metadata_uri: str
    metadata_hash: str
    created_at: datetime
    updated_at: datetime


class ProjectCreate(BaseModel):
    slug: str
    name: str
    category: str
    biome: str
    country: str = "BR"
    region: str = ""
    location_label: str
    objective: str
    impact_summary: str
    story: str
    risks: str
    funding_goal_mist: int
    metadata_uri: str = ""
    metadata_hash: str = ""


class ProjectChainUpdate(BaseModel):
    sui_package_id: str
    sui_project_id: str
    sui_vault_id: str
    status: str = "active"

