"""One-time dev/bootstrap helpers (optional env-based staff user)."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings
from app.models import User
from app.schemas import USERNAME_RE
from app.security import hash_password


def bootstrap_staff_if_configured(db: Session, settings: Settings) -> None:
    email = (settings.bootstrap_staff_email or "").strip().lower()
    password = settings.bootstrap_staff_password or ""
    if not email or not password:
        return
    if db.scalar(select(User).where(User.email == email)):
        return
    raw = (settings.bootstrap_staff_username or "admin").strip().lower()
    uname = raw if USERNAME_RE.fullmatch(raw) else "admin"
    if uname and db.scalar(select(User).where(User.username == uname)):
        return
    role = settings.bootstrap_staff_role or "staff"
    if role not in ("staff", "admin"):
        role = "staff"
    db.add(
        User(
            email=email,
            username=uname or None,
            hashed_password=hash_password(password),
            full_name="Bootstrap staff",
            role=role,
        )
    )
    db.commit()
