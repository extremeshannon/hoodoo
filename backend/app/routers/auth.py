from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import User
from app.schemas import (
    USERNAME_RE,
    ForgotPasswordIn,
    ForgotPasswordOut,
    Token,
    UserOut,
    UserRegister,
)
from app.security import create_access_token, hash_password, verify_password

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


@router.post("/forgot-password", response_model=ForgotPasswordOut)
def forgot_password(_body: ForgotPasswordIn):
    """
    Request a password reset. Response is always the same whether the email exists (avoid account enumeration).
    Email delivery can be wired later (SMTP / transactional provider).
    """
    return ForgotPasswordOut(
        message="If an account exists for that email, you'll receive reset instructions shortly.",
    )
