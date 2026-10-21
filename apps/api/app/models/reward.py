from sqlalchemy import Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class RewardBook(Base):
    __tablename__ = "reward_books"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    revision: Mapped[int] = mapped_column(Integer, nullable=False)
    head_hash: Mapped[str] = mapped_column(String(64), nullable=False)


class RewardEvent(Base):
    __tablename__ = "reward_events"
    sequence: Mapped[int] = mapped_column(Integer, primary_key=True)
    key: Mapped[str] = mapped_column(String(200), nullable=False, unique=True)
    kind: Mapped[str] = mapped_column(String(40), nullable=False)
    payload: Mapped[str] = mapped_column(Text, nullable=False)
    recorded_at: Mapped[str] = mapped_column(String(40), nullable=False)
    previous_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    event_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
