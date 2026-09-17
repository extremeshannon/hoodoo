"""Paths that stay staff-only while the shop is a work in progress."""

from __future__ import annotations

from urllib.parse import quote

STAFF_PREFIXES = (
    "/configurator",
    "/cart",
    "/suit",
    "/quote",
    "/pricing",
    "/viewer",
    "/account",
    "/order",
    "/register",
    "/admin.html",
    "/3d/",
    "/data/",
    "/js/suit-configurator",
    "/js/sizing-avatar",
    "/js/config-preview",
    "/js/admin-configurator",
    "/js/admin.js",
    "/js/quote.js",
    "/js/pricing.js",
    "/js/viewer-3d",
)


def is_staff_only_path(path: str) -> bool:
    if path.startswith("/api/"):
        return False
    if path.startswith("/admin/login"):
        return False
    if path.startswith("/admin/logout"):
        return False
    if path.startswith("/admin/"):
        return True
    return any(path == prefix or path.startswith(prefix) for prefix in STAFF_PREFIXES)


def login_redirect_url(path: str, query: str = "") -> str:
    nxt = path or "/"
    if query:
        nxt = f"{nxt}?{query}"
    if not nxt.startswith("/") or nxt.startswith("//"):
        nxt = "/"
    return "/login?next=" + quote(nxt, safe="/")
