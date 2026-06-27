from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ProjectTierBase(BaseModel):
    slug: str
    name: str
    amount_mist: int
    allocation_points: int
    chain_tier: int = 0
    metadata_uri: str = ""
    description: str = ""
    display_order: int = 0
    is_active: bool = True


class ProjectTierCreate(ProjectTierBase):
    pass


class ProjectTierRead(ProjectTierBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    created_at: datetime
    updated_at: datetime


class ProjectMilestoneBase(BaseModel):
    title: str
    target_amount_mist: int = 0
    status: str = "planned"
    description: str = ""
    display_order: int = 0


class ProjectMilestoneCreate(ProjectMilestoneBase):
    pass


class ProjectMilestoneRead(ProjectMilestoneBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    created_at: datetime
    updated_at: datetime


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
    image_uri: str
    display_status: str
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
    tiers: list[ProjectTierRead] = Field(default_factory=list)
    milestones: list[ProjectMilestoneRead] = Field(default_factory=list)
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
    image_uri: str = ""
    display_status: str = ""
    objective: str
    impact_summary: str
    story: str
    risks: str
    funding_goal_mist: int
    metadata_uri: str = ""
    metadata_hash: str = ""
    tiers: list[ProjectTierCreate] = Field(default_factory=list)
    milestones: list[ProjectMilestoneCreate] = Field(default_factory=list)


class ProjectUpdate(BaseModel):
    name: str | None = None
    category: str | None = None
    biome: str | None = None
    country: str | None = None
    region: str | None = None
    location_label: str | None = None
    image_uri: str | None = None
    display_status: str | None = None
    objective: str | None = None
    impact_summary: str | None = None
    story: str | None = None
    risks: str | None = None
    status: str | None = None
    verification_level: int | None = None
    funding_goal_mist: int | None = None
    raised_mist: int | None = None
    metadata_uri: str | None = None
    metadata_hash: str | None = None


class ProjectChainUpdate(BaseModel):
    sui_package_id: str
    sui_project_id: str
    sui_vault_id: str
    status: str = "active"


class ProjectTierReplace(BaseModel):
    tiers: list[ProjectTierCreate]


class ProjectMilestoneReplace(BaseModel):
    milestones: list[ProjectMilestoneCreate]
