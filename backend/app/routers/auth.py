from __future__ import annotations

import logging
import secrets
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import delete, or_, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.deps import get_current_user
from app.models import PasswordResetToken, User
from app.password_reset_mail import send_password_reset_email
from app.schemas import (
    USERNAME_RE,
    ForgotPasswordIn,
    ForgotPasswordOut,
    ResetPasswordIn,
    ResetPasswordOut,
    Token,
    UserOut,
    UserRegister,
)
from app.security import create_access_token, hash_password, hash_reset_token, verify_password

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=Token)
def register(body: UserRegister, db: Session = Depends(get_db)):
    email = body.email.lower().strip()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")
    uname = (body.username or "").strip().lower() or None
    if uname:
        if not USERNAME_RE.fullmatch(uname):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username must be 3–32 characters (letters, digits, . _ -)",
            )
        if db.scalar(select(User).where(User.username == uname)):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username already taken")
    user = User(
        email=email,
        username=uname,
        hashed_password=hash_password(body.password),
        full_name=body.full_name,
        role="customer",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return Token(access_token=create_access_token(user.id, {"role": user.role}))


@router.post("/token", response_model=Token)
def login(
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    db: Session = Depends(get_db),
):
    """OAuth2 password flow: `username` = email address or username handle, `password` = password."""
    login_id = (form_data.username or "").strip().lower()
    if not login_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user = db.scalar(
        select(User).where(or_(User.email == login_id, User.username == login_id))
    )
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account disabled")
    return Token(access_token=create_access_token(user.id, {"role": user.role}))


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user


_GENERIC_FORGOT_MSG = "If an account exists for that email, you'll receive reset instructions shortly."


@router.post("/forgot-password", response_model=ForgotPasswordOut)
def forgot_password(body: ForgotPasswordIn, db: Session = Depends(get_db)):
    """
    Creates a one-time reset token. Response is always the same whether the email exists
    (avoid account enumeration). With SMTP configured, sends mail; otherwise logs the link (dev).
    """
    settings = get_settings()
    email = body.email.lower().strip()
    user = db.scalar(select(User).where(User.email == email))

    if user:
        db.execute(
            delete(PasswordResetToken).where(
                PasswordResetToken.user_id == user.id,
                PasswordResetToken.used_at.is_(None),
            )
        )
        raw = secrets.token_urlsafe(32)
        token_hash = hash_reset_token(raw)
        expires = datetime.now(UTC) + timedelta(hours=settings.password_reset_token_hours)
        db.add(
            PasswordResetToken(
                user_id=user.id,
                token_sha256=token_hash,
                expires_at=expires,
            )
        )
        db.commit()

        base = settings.public_base_url.rstrip("/")
        link = f"{base}/reset-password?token={raw}"
        if send_password_reset_email(user.email, link, settings):
            logger.info("Password reset email sent to %s", user.email)
        else:
            logger.warning(
                "Password reset for %s — SMTP not configured; use this link once: %s",
                user.email,
                link,
            )

    return ForgotPasswordOut(message=_GENERIC_FORGOT_MSG)


@router.post("/reset-password", response_model=ResetPasswordOut)
def reset_password(body: ResetPasswordIn, db: Session = Depends(get_db)):
    """Exchange a valid token from the email (or dev log) for a new password."""
    now = datetime.now(UTC)
    th = hash_reset_token(body.token.strip())
    row = db.scalar(
        select(PasswordResetToken).where(
            PasswordResetToken.token_sha256 == th,
            PasswordResetToken.used_at.is_(None),
        )
    )
    if not row or row.expires_at < now:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset link. Request a new one from Forgot password.",
        )
    user = db.get(User, row.user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User not found.")
    user.hashed_password = hash_password(body.password)
    row.used_at = now
    db.add(user)
    db.add(row)
    db.commit()
    return ResetPasswordOut(message="Your password was updated. You can sign in now.")
