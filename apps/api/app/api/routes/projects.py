from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_db, require_admin_token
from app.models.project import Project
from app.schemas.project import ProjectChainUpdate, ProjectCreate, ProjectRead

router = APIRouter()


@router.get("", response_model=list[ProjectRead])
def list_projects(db: Session = Depends(get_db)) -> list[Project]:
    return list(db.scalars(select(Project).order_by(Project.created_at.desc())))


@router.get("/{slug}", response_model=ProjectRead)
def get_project(slug: str, db: Session = Depends(get_db)) -> Project:
    project = db.scalar(select(Project).where(Project.slug == slug))
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")
    return project


@router.post("", response_model=ProjectRead, dependencies=[Depends(require_admin_token)])
def create_project(payload: ProjectCreate, db: Session = Depends(get_db)) -> Project:
    project = Project(**payload.model_dump())
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


@router.patch("/{slug}/chain", response_model=ProjectRead, dependencies=[Depends(require_admin_token)])
def update_project_chain(
    slug: str,
    payload: ProjectChainUpdate,
    db: Session = Depends(get_db),
) -> Project:
    project = db.scalar(select(Project).where(Project.slug == slug))
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")

    for key, value in payload.model_dump().items():
        setattr(project, key, value)

    db.commit()
    db.refresh(project)
    return project

