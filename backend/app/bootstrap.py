"""One-time dev/bootstrap helpers (optional env-based staff user)."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings
from app.models import User
from app.schemas import USERNAME_RE
from app.security import hash_password


def bootstrap_staff_if_configured(db: Session, settings: Settings) -> None:
    admin_user = (settings.hoodoo_admin_user or "").strip().lower()
    password = settings.bootstrap_staff_password or settings.hoodoo_admin_password or ""
    email = (settings.bootstrap_staff_email or "").strip().lower()
    if not email and admin_user:
        email = admin_user if "@" in admin_user else f"{admin_user}@hoodooak.com"
    if not email or not password:
        return
    if db.scalar(select(User).where(User.email == email)):
        return
    raw = (settings.bootstrap_staff_username or admin_user or "admin").strip().lower()
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
