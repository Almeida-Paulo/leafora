from sqlalchemy import BigInteger, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, new_uuid


class Project(Base, TimestampMixin):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    slug: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(180))
    category: Mapped[str] = mapped_column(String(120))
    biome: Mapped[str] = mapped_column(String(120))
    country: Mapped[str] = mapped_column(String(80), default="BR")
    region: Mapped[str] = mapped_column(String(120), default="")
    location_label: Mapped[str] = mapped_column(String(240))
    objective: Mapped[str] = mapped_column(Text)
    impact_summary: Mapped[str] = mapped_column(Text)
    story: Mapped[str] = mapped_column(Text)
    risks: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(40), default="draft", index=True)
    verification_level: Mapped[int] = mapped_column(Integer, default=0)
    funding_goal_mist: Mapped[int] = mapped_column(BigInteger)
    raised_mist: Mapped[int] = mapped_column(BigInteger, default=0)
    sui_package_id: Mapped[str] = mapped_column(String(80), default="")
    sui_project_id: Mapped[str] = mapped_column(String(80), default="")
    sui_vault_id: Mapped[str] = mapped_column(String(80), default="")
    metadata_uri: Mapped[str] = mapped_column(Text, default="")
    metadata_hash: Mapped[str] = mapped_column(String(130), default="")

    evidence_records = relationship("EvidenceRecord", back_populates="project")
    supports = relationship("Support", back_populates="project")

