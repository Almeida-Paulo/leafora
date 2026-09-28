from sqlalchemy import BigInteger, String, Text
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base, new_uuid


class StellarIntent(Base):
    __tablename__ = "stellar_intents"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    network: Mapped[str] = mapped_column(String(16))
    contract: Mapped[str] = mapped_column(String(56))
    wallet: Mapped[str] = mapped_column(String(56), index=True)
    tx_hash: Mapped[str] = mapped_column(String(64), unique=True)
    xdr: Mapped[str] = mapped_column(Text)
    expires: Mapped[int] = mapped_column(BigInteger, index=True)
