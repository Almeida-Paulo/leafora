from collections.abc import Generator
from hmac import compare_digest

from fastapi import Header, HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import SessionLocal


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def require_admin_token(x_admin_token: str = Header(default="")) -> None:
    if not settings.admin_token or not compare_digest(x_admin_token, settings.admin_token):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid admin token.",
        )
