"""Send password reset links via SMTP when configured."""

from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage

from app.config import Settings

logger = logging.getLogger(__name__)


def send_password_reset_email(to_email: str, reset_link: str, settings: Settings) -> bool:
    """
    Return True if an email was sent. If SMTP is not configured, return False
    (caller should log the link for local development).
    """
    host = (settings.smtp_host or "").strip()
    if not host:
        return False

    from_addr = (settings.smtp_from or settings.smtp_user or "").strip()
    if not from_addr:
        logger.error("SMTP_FROM or SMTP_USER must be set when SMTP_HOST is configured")
        return False

    msg = EmailMessage()
    msg["Subject"] = "Reset your Hoodoo Alaska password"
    msg["From"] = from_addr
    msg["To"] = to_email
    msg.set_content(
        f"Use this link to choose a new password (expires in {settings.password_reset_token_hours} hours):\n\n"
        f"{reset_link}\n\n"
        "If you did not request this, you can ignore this email."
    )

    try:
        with smtplib.SMTP(host, settings.smtp_port, timeout=30) as smtp:
            if settings.smtp_use_tls:
                smtp.starttls()
            user = (settings.smtp_user or "").strip()
            password = settings.smtp_password or ""
            if user:
                smtp.login(user, password)
            smtp.send_message(msg)
    except OSError as e:
        logger.exception("SMTP error sending password reset to %s: %s", to_email, e)
        return False
    return True
