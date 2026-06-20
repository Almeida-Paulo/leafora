from sqlalchemy import BigInteger, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, new_uuid


class Support(Base, TimestampMixin):
    __tablename__ = "supports"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), index=True)
    wallet_address: Mapped[str] = mapped_column(String(80), index=True)
    tier: Mapped[str] = mapped_column(String(60))
    amount_mist: Mapped[int] = mapped_column(BigInteger)
    allocation_points: Mapped[int] = mapped_column(BigInteger)
    sui_tx_digest: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    supporter_nft_id: Mapped[str] = mapped_column(String(80), default="")

    project = relationship("Project", back_populates="supports")

