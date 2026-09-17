"""Pickup vs shipping quotes. Flat-zone rates until a carrier + payment gateway are wired."""

from __future__ import annotations

import json
from decimal import Decimal
from pathlib import Path
from typing import Any

from app.config import get_settings

_AK_PREFIX = ("995", "996", "997", "998", "999")
_HI_PREFIX = ("967", "968")
_TERRITORY = {"PR", "GU", "VI", "AS", "MP"}


def _repo_root() -> Path:
    settings = get_settings()
    if settings.repo_root:
        return Path(settings.repo_root).resolve()
    return Path(__file__).resolve().parent.parent.parent


def load_shipping_config() -> dict[str, Any]:
    path = _repo_root() / "data" / "shipping.json"
    if not path.is_file():
        return {
            "pickup": {
                "id": "pickup",
                "label": "Pickup",
                "title": "Pickup in Wasilla",
                "price": 0,
                "detail": "We'll call when ready.",
                "name": "Hoodoo Alaska",
                "line1": "7362 W Parks Hwy PMB 213",
                "city": "Wasilla",
                "region": "AK",
                "postal": "99623",
                "country": "US",
                "phone": "907.202.5634",
                "hours": "By arrangement.",
            },
            "checkout": {
                "paymentGateway": None,
                "status": "coming_soon",
                "message": "Payment gateway coming soon.",
            },
            "zones": [],
            "countries": [{"id": "US", "label": "United States"}],
            "regions": {"US": [{"id": "AK", "label": "Alaska"}]},
        }
    return json.loads(path.read_text(encoding="utf-8"))


def pickup_snapshot(cfg: dict[str, Any] | None = None) -> dict[str, Any]:
    cfg = cfg or load_shipping_config()
    p = cfg.get("pickup") or {}
    return {
        "id": p.get("id") or "pickup",
        "label": p.get("label") or "Pickup",
        "title": p.get("title") or "Pickup in Wasilla",
        "detail": p.get("detail") or "",
        "name": p.get("name") or "Hoodoo Alaska",
        "line1": p.get("line1") or "",
        "city": p.get("city") or "",
        "region": p.get("region") or "",
        "postal": p.get("postal") or "",
        "country": p.get("country") or "US",
        "phone": p.get("phone") or "",
        "hours": p.get("hours") or "",
    }


def methods_public() -> dict[str, Any]:
    cfg = load_shipping_config()
    return {
        "pickup": pickup_snapshot(cfg),
        "checkout": cfg.get("checkout") or {},
        "zones": cfg.get("zones") or [],
        "countries": cfg.get("countries") or [],
        "regions": cfg.get("regions") or {},
    }


def _norm_country(country: str | None) -> str:
    raw = (country or "US").strip().upper()
    if raw in {"USA", "UNITED STATES", "US"}:
        return "US"
    if raw in {"CA", "CAN", "CANADA"}:
        return "CA"
    return raw


def zone_id_for(country: str | None, region: str | None, postal: str | None) -> str:
    c = _norm_country(country)
    r = (region or "").strip().upper()
    z = "".join(ch for ch in (postal or "") if ch.isdigit())
    if c == "US":
        if r == "AK" or z.startswith(_AK_PREFIX):
            return "alaska"
        if r == "HI" or z.startswith(_HI_PREFIX):
            return "hawaii"
        if r in _TERRITORY:
            return "hawaii"
        return "continental_us"
    if c == "CA":
        return "canada"
    return "international"


def _zone(cfg: dict[str, Any], zone_id: str) -> dict[str, Any]:
    for z in cfg.get("zones") or []:
        if z.get("id") == zone_id:
            return z
    return {"id": zone_id, "label": zone_id, "price": None, "quoted": True, "detail": ""}


def destination_complete(dest: dict[str, Any] | None) -> bool:
    if not dest:
        return False
    need = ("name", "line1", "city", "region", "postal", "country")
    return all(str(dest.get(k) or "").strip() for k in need)


def money(n: Decimal | int | float | str) -> str:
    return f"{Decimal(str(n)).quantize(Decimal('0.01')):.2f}"


def quote(
    method: str,
    destination: dict[str, Any] | None,
    item_count: int,
) -> dict[str, Any]:
    cfg = load_shipping_config()
    method = (method or "pickup").strip().lower()
    if method not in {"pickup", "shipping"}:
        method = "pickup"
    count = max(1, int(item_count or 1))

    if method == "pickup":
        p = pickup_snapshot(cfg)
        phone = str((destination or {}).get("phone") or "").strip()
        return {
            "method": "pickup",
            "rate_id": "pickup",
            "rate_label": p["title"],
            "shipping_amount": "0.00",
            "quoted": False,
            "needs_address": False,
            "detail": p["detail"],
            "pickup": p,
            "destination": {"phone": phone} if phone else None,
            "zone_id": None,
        }

    dest = dict(destination or {})
    dest["country"] = _norm_country(dest.get("country"))
    dest["region"] = str(dest.get("region") or "").strip().upper()
    dest["postal"] = str(dest.get("postal") or "").strip().upper()
    dest["name"] = str(dest.get("name") or "").strip()
    dest["line1"] = str(dest.get("line1") or "").strip()
    dest["line2"] = str(dest.get("line2") or "").strip()
    dest["city"] = str(dest.get("city") or "").strip()
    dest["phone"] = str(dest.get("phone") or "").strip()

    if not destination_complete(dest):
        return {
            "method": "shipping",
            "rate_id": None,
            "rate_label": "Enter a shipping address",
            "shipping_amount": "0.00",
            "quoted": False,
            "needs_address": True,
            "detail": "Add name, street, city, state, and ZIP for a shipping estimate.",
            "pickup": None,
            "destination": dest,
            "zone_id": None,
        }

    zid = zone_id_for(dest["country"], dest["region"], dest["postal"])
    zone = _zone(cfg, zid)
    quoted = bool(zone.get("quoted") or zone.get("price") is None)
    if quoted:
        return {
            "method": "shipping",
            "rate_id": zid,
            "rate_label": zone.get("label") or zid,
            "shipping_amount": "0.00",
            "quoted": True,
            "needs_address": False,
            "detail": zone.get("detail") or "We'll confirm shipping before payment.",
            "pickup": None,
            "destination": dest,
            "zone_id": zid,
        }

    base = Decimal(str(zone.get("price") or 0))
    extra_each = Decimal(str(zone.get("perAdditional") or 0))
    extra = extra_each * Decimal(count - 1)
    amount = base + extra
    return {
        "method": "shipping",
        "rate_id": zid,
        "rate_label": zone.get("label") or zid,
        "shipping_amount": money(amount),
        "quoted": False,
        "needs_address": False,
        "detail": zone.get("detail") or "",
        "pickup": None,
        "destination": dest,
        "zone_id": zid,
    }


def default_fulfillment() -> dict[str, Any]:
    q = quote("pickup", None, 1)
    return q


def fulfillment_label(ful: dict[str, Any] | None) -> str:
    if not ful:
        return "Pickup in Wasilla"
    if ful.get("method") == "shipping":
        dest = ful.get("destination") or {}
        bits = [ful.get("rate_label") or "Shipping"]
        city = dest.get("city")
        region = dest.get("region")
        if city or region:
            bits.append(", ".join(x for x in (city, region) if x))
        if ful.get("quoted"):
            bits.append("quoted")
        return " · ".join(bits)
    return ful.get("rate_label") or "Pickup in Wasilla"
