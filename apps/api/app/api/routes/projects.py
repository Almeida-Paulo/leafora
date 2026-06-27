from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import get_db, require_admin_token
from app.models.project import Project
from app.models.project_milestone import ProjectMilestone
from app.models.project_tier import ProjectTier
from app.schemas.project import (
    ProjectChainUpdate,
    ProjectCreate,
    ProjectMilestoneRead,
    ProjectMilestoneReplace,
    ProjectRead,
    ProjectTierRead,
    ProjectTierReplace,
    ProjectUpdate,
)

router = APIRouter()


@router.get("", response_model=list[ProjectRead])
def list_projects(db: Session = Depends(get_db)) -> list[Project]:
    return list(
        db.scalars(
            select(Project)
            .options(selectinload(Project.tiers), selectinload(Project.milestones))
            .order_by(Project.created_at.desc())
        )
    )


@router.get("/{slug}", response_model=ProjectRead)
def get_project(slug: str, db: Session = Depends(get_db)) -> Project:
    project = _get_project_by_slug(db, slug)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")
    return project


@router.post("", response_model=ProjectRead, dependencies=[Depends(require_admin_token)])
def create_project(payload: ProjectCreate, db: Session = Depends(get_db)) -> Project:
    data = payload.model_dump()
    tiers = data.pop("tiers")
    milestones = data.pop("milestones")
    project = Project(**data)
    db.add(project)
    db.flush()
    _replace_tiers(db, project, tiers)
    _replace_milestones(db, project, milestones)
    db.commit()
    db.refresh(project)
    return project


@router.patch("/{slug}", response_model=ProjectRead, dependencies=[Depends(require_admin_token)])
def update_project(
    slug: str,
    payload: ProjectUpdate,
    db: Session = Depends(get_db),
) -> Project:
    project = _get_project_by_slug(db, slug)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")

    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(project, key, value)

    db.commit()
    db.refresh(project)
    return project


@router.patch("/{slug}/chain", response_model=ProjectRead, dependencies=[Depends(require_admin_token)])
def update_project_chain(
    slug: str,
    payload: ProjectChainUpdate,
    db: Session = Depends(get_db),
) -> Project:
    project = _get_project_by_slug(db, slug)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")

    for key, value in payload.model_dump().items():
        setattr(project, key, value)

    db.commit()
    db.refresh(project)
    return project


@router.put(
    "/{slug}/tiers",
    response_model=list[ProjectTierRead],
    dependencies=[Depends(require_admin_token)],
)
def replace_project_tiers(
    slug: str,
    payload: ProjectTierReplace,
    db: Session = Depends(get_db),
) -> list[ProjectTier]:
    project = _get_project_by_slug(db, slug)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")

    tiers = _replace_tiers(db, project, [item.model_dump() for item in payload.tiers])
    db.commit()
    return tiers


@router.put(
    "/{slug}/milestones",
    response_model=list[ProjectMilestoneRead],
    dependencies=[Depends(require_admin_token)],
)
def replace_project_milestones(
    slug: str,
    payload: ProjectMilestoneReplace,
    db: Session = Depends(get_db),
) -> list[ProjectMilestone]:
    project = _get_project_by_slug(db, slug)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")

    milestones = _replace_milestones(
        db,
        project,
        [item.model_dump() for item in payload.milestones],
    )
    db.commit()
    return milestones


def _get_project_by_slug(db: Session, slug: str) -> Project | None:
    return db.scalar(
        select(Project)
        .where(Project.slug == slug)
        .options(selectinload(Project.tiers), selectinload(Project.milestones))
    )


def _replace_tiers(db: Session, project: Project, tiers: list[dict]) -> list[ProjectTier]:
    project.tiers.clear()
    new_tiers = [ProjectTier(project=project, **tier) for tier in tiers]
    db.add_all(new_tiers)
    db.flush()
    return new_tiers


def _replace_milestones(db: Session, project: Project, milestones: list[dict]) -> list[ProjectMilestone]:
    project.milestones.clear()
    new_milestones = [
        ProjectMilestone(project=project, **milestone)
        for milestone in milestones
    ]
    db.add_all(new_milestones)
    db.flush()
    return new_milestones
