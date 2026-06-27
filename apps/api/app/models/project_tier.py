from sqlalchemy import BigInteger, Boolean, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, new_uuid


class ProjectTier(Base, TimestampMixin):
    __tablename__ = "project_tiers"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), index=True)
    slug: Mapped[str] = mapped_column(String(80))
    name: Mapped[str] = mapped_column(String(120))
    amount_mist: Mapped[int] = mapped_column(BigInteger)
    allocation_points: Mapped[int] = mapped_column(BigInteger)
    chain_tier: Mapped[int] = mapped_column(Integer, default=0)
    metadata_uri: Mapped[str] = mapped_column(Text, default="")
    description: Mapped[str] = mapped_column(Text, default="")
    display_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)

    project = relationship("Project", back_populates="tiers")
