"""Paths that stay staff-only while the shop is a work in progress."""

from __future__ import annotations

from urllib.parse import quote

# Logged-in customers: save prints, send quotes, open account history.
CUSTOMER_AUTH_PREFIXES = (
    "/dyesub",
    "/screenprint",
    "/embroidery",
    "/account",
    "/order",
    "/js/dyesub",
    "/js/screenprint",
    "/js/embroidery",
    "/3d/",
    "/data/dyesub",
    "/data/screenprint",
    "/data/embroidery",
    "/data/materials.json",
)

STAFF_PREFIXES = (
    "/configurator",
    "/cart",
    "/suit",
    "/quote",
    "/pricing",
    "/viewer",
    "/register",
    "/admin.html",
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


def _matches(path: str, prefixes: tuple[str, ...]) -> bool:
    return any(path == prefix or path.startswith(prefix) for prefix in prefixes)


def is_customer_auth_path(path: str) -> bool:
    if path.startswith("/api/"):
        return False
    return _matches(path, CUSTOMER_AUTH_PREFIXES)


def is_staff_only_path(path: str) -> bool:
    if path.startswith("/api/"):
        return False
    if path.startswith("/admin/login"):
        return False
    if path.startswith("/admin/logout"):
        return False
    if path.startswith("/admin/"):
        return True
    if is_customer_auth_path(path):
        return False
    return _matches(path, STAFF_PREFIXES)


def login_redirect_url(path: str, query: str = "") -> str:
    nxt = path or "/"
    if query:
        nxt = f"{nxt}?{query}"
    if not nxt.startswith("/") or nxt.startswith("//"):
        nxt = "/"
    return "/login?next=" + quote(nxt, safe="/")
