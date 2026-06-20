from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, new_uuid


class EvidenceRecord(Base, TimestampMixin):
    __tablename__ = "evidence_records"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), index=True)
    title: Mapped[str] = mapped_column(String(180))
    content_uri: Mapped[str] = mapped_column(Text)
    content_hash: Mapped[str] = mapped_column(String(130), index=True)
    metadata_hash: Mapped[str] = mapped_column(String(130), default="")
    geohash: Mapped[str] = mapped_column(String(32), default="")
    latitude: Mapped[str] = mapped_column(String(40), default="")
    longitude: Mapped[str] = mapped_column(String(40), default="")
    capture_timestamp: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(40), default="pending", index=True)
    submitter_address: Mapped[str] = mapped_column(String(80), default="")
    sui_object_id: Mapped[str] = mapped_column(String(80), default="")
    sui_tx_digest: Mapped[str] = mapped_column(String(120), default="")

    project = relationship("Project", back_populates="evidence_records")

