"""Map shop catalog slugs to CLO GLB previews."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app.config import get_settings

SLUG_TO_CLO = {
    "suit-freefly-jacket": "freefly-jacket",
    "suit-camera-jacket": "camera-jacket",
    "suit-jumpsuit": "jumpsuit",
    "suit-freefly": "jumpsuit",
    "suit-rw": "jumpsuit",
    "suit-pants": "pants",
    "upc-custom": "ultimate-paw-covers",
    "upc-pro": "ultimate-paw-covers",
    "upc-trail": "ultimate-paw-covers",
    "upc-lite": "ultimate-paw-covers",
    "jersey-pro-sub": "male-jersey-blunt-collar",
    "jersey-mesh": "male-jersey-blunt-collar",
}


def _root() -> Path:
    settings = get_settings()
    if settings.repo_root:
        return Path(settings.repo_root).resolve()
    return Path(__file__).resolve().parent.parent.parent


def _first_url(value: Any) -> str | None:
    if isinstance(value, list):
        for item in value:
            url = _first_url(item)
            if url:
                return url
        return None
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None


def _clo_by_id() -> dict[str, dict[str, Any]]:
    path = _root() / "3d" / "clo" / "manifest.json"
    if not path.is_file():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    out: dict[str, dict[str, Any]] = {}
    for p in data.get("products") or []:
        pid = p.get("id")
        if pid:
            out[str(pid)] = p
    return out


def clo_id_for(slug: str, name: str = "") -> str | None:
    if slug in SLUG_TO_CLO:
        return SLUG_TO_CLO[slug]
    n = (name or "").lower()
    if "paw" in n or "gauntlet" in n:
        return "ultimate-paw-covers"
    if "camera" in n:
        return "camera-jacket"
    if "freefly" in n and "jacket" in n:
        return "freefly-jacket"
    if "pant" in n:
        return "pants"
    if "jumpsuit" in n or "jump suit" in n or "freefly" in n:
        return "jumpsuit"
    if "jersey" in n:
        return "male-jersey-blunt-collar"
    return None


def preview_for_product(slug: str, name: str = "") -> dict[str, Any] | None:
    clo_id = clo_id_for(slug, name)
    if not clo_id:
        return None
    product = _clo_by_id().get(clo_id)
    if not product:
        return None
    by_fit: dict[str, str] = {}
    raw = product.get("glbByFit") or {}
    if isinstance(raw, dict):
        for fit, val in raw.items():
            url = _first_url(val)
            if url:
                by_fit[str(fit)] = url
    fallback = _first_url(product.get("glb"))
    if fallback and not by_fit:
        by_fit["default"] = fallback
    if not by_fit:
        return None
    default = by_fit.get("male") or by_fit.get("unisex") or by_fit.get("female") or next(iter(by_fit.values()))
    return {
        "cloId": clo_id,
        "glb": default,
        "glbByFit": by_fit,
        "builderUrl": "/suit.html",
    }


def is_made_to_order(category_slug: str, product_slug: str) -> bool:
    if category_slug == "jumpsuits":
        return True
    return product_slug.startswith("suit-")
