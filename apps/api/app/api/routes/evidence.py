from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_db, require_admin_token
from app.models.evidence import EvidenceRecord
from app.models.project import Project
from app.schemas.evidence import EvidenceCreate, EvidenceRead, EvidenceReview

router = APIRouter()


@router.get("/projects/{slug}/evidence", response_model=list[EvidenceRead])
def list_project_evidence(slug: str, db: Session = Depends(get_db)) -> list[EvidenceRecord]:
    project = db.scalar(select(Project).where(Project.slug == slug))
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")

    return list(
        db.scalars(
            select(EvidenceRecord)
            .where(EvidenceRecord.project_id == project.id)
            .order_by(EvidenceRecord.created_at.desc())
        )
    )


@router.post("/evidence", response_model=EvidenceRead, dependencies=[Depends(require_admin_token)])
def create_evidence(payload: EvidenceCreate, db: Session = Depends(get_db)) -> EvidenceRecord:
    evidence = EvidenceRecord(**payload.model_dump())
    db.add(evidence)
    db.commit()
    db.refresh(evidence)
    return evidence


@router.patch(
    "/evidence/{evidence_id}/review",
    response_model=EvidenceRead,
    dependencies=[Depends(require_admin_token)],
)
def review_evidence(
    evidence_id: str,
    payload: EvidenceReview,
    db: Session = Depends(get_db),
) -> EvidenceRecord:
    evidence = db.get(EvidenceRecord, evidence_id)
    if not evidence:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evidence not found.")

    for key, value in payload.model_dump().items():
        setattr(evidence, key, value)

    db.commit()
    db.refresh(evidence)
    return evidence

