"""Embroidery / screen-print / dye-sub guide estimates (CustomInk-style)."""

from __future__ import annotations

import json
from decimal import Decimal, ROUND_HALF_UP
from functools import lru_cache
from pathlib import Path
from typing import Any


def _money(n: Decimal | float | int) -> Decimal:
    return Decimal(str(n)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _repo_root() -> Path:
    from app.config import get_settings

    settings = get_settings()
    if settings.repo_root:
        return Path(settings.repo_root).resolve()
    pkg = Path(__file__).resolve().parent
    for cand in (pkg.parent.parent, pkg.parent):
        if (cand / "data" / "decoration-pricing.json").is_file():
            return cand
    return pkg.parent.parent


@lru_cache(maxsize=1)
def load_pricing() -> dict[str, Any]:
    path = _repo_root() / "data" / "decoration-pricing.json"
    return json.loads(path.read_text(encoding="utf-8"))


def qty_tier(qty: int, tiers: list[int]) -> int:
    q = max(1, int(qty))
    chosen = tiers[0]
    for t in tiers:
        if q >= t:
            chosen = t
    return chosen


def _band_for_stitches(emb: dict, stitches: int) -> dict:
    s = max(int(stitches), int(emb.get("minStitchesBilled") or 0))
    bands = emb["stitchBands"]
    for b in bands:
        if s <= int(b["maxStitches"]):
            return b
    return bands[-1]


def _band_for_colors(screen: dict, colors: int) -> dict:
    c = max(1, int(colors))
    bands = screen["colorBands"]
    for b in bands:
        if c <= int(b["colors"]):
            return b
    return bands[-1]


def _lookup_piece(table: dict[str, dict[str, float]], band_id: str, tier: int) -> Decimal:
    row = table[band_id]
    return _money(row[str(tier)])


def estimate(payload: dict[str, Any]) -> dict[str, Any]:
    data = load_pricing()
    meta = data["meta"]
    tiers: list[int] = list(meta["qtyTiers"])
    qty = max(1, min(999, int(payload.get("quantity") or 1)))
    tier = qty_tier(qty, tiers)
    garment_id = str(payload.get("garment") or "tee")
    method = str(payload.get("method") or "embroidery")
    locations = max(1, min(6, int(payload.get("locations") or 1)))

    garments = {g["id"]: g for g in data["garments"]}
    g = garments.get(garment_id) or garments["tee"]
    blank = _money(g["blank"])
    garment_total = blank * qty

    lines: list[dict[str, Any]] = [
        {
            "label": f"{g['name']} blank × {qty}",
            "amount": float(garment_total),
        }
    ]
    setup = Decimal("0")
    deco_unit = Decimal("0")
    extra = Decimal("0")

    if method == "embroidery":
        emb = data["embroidery"]
        stitches = int(payload.get("stitches") or 5000)
        band = _band_for_stitches(emb, stitches)
        deco_unit = _lookup_piece(emb["perPiece"], band["id"], tier)
        deco_total = deco_unit * qty
        extra_loc = max(0, locations - 1)
        extra = _money(deco_unit * Decimal(str(emb["extraLocationFactor"])) * extra_loc * qty)
        setup = _money(emb["digitizingFirst"]) + _money(emb["digitizingAdditional"]) * extra_loc
        lines.append(
            {
                "label": f"Embroidery · {band['label']} · {tier}+ rate × {qty}",
                "amount": float(deco_total),
            }
        )
        if extra:
            lines.append({"label": f"Additional locations ({extra_loc})", "amount": float(extra)})
        lines.append({"label": "Digitizing / setup", "amount": float(setup)})
        deco_total = deco_total + extra
    elif method == "screen":
        scr = data["screenPrint"]
        colors = int(payload.get("colors") or 1)
        band = _band_for_colors(scr, colors)
        deco_unit = _lookup_piece(scr["perPiece"], band["id"], tier)
        deco_total = deco_unit * qty
        extra_loc = max(0, locations - 1)
        extra = _money(deco_unit * Decimal(str(scr["extraLocationFactor"])) * extra_loc * qty)
        color_count = int(band["colors"])
        if qty < int(scr["screenFeeWaivedAtQty"]):
            setup = _money(scr["screenFeePerColor"]) * color_count
        lines.append(
            {
                "label": f"Screen print · {band['label']} · {tier}+ rate × {qty}",
                "amount": float(deco_total),
            }
        )
        if extra:
            lines.append({"label": f"Additional locations ({extra_loc})", "amount": float(extra)})
        if setup:
            lines.append({"label": f"Screen setup ({color_count} color)", "amount": float(setup)})
        deco_total = deco_total + extra
    elif method == "dye-sub":
        ds = data["dyeSub"]
        deco_unit = _money(ds["perPiece"][str(tier)])
        deco_total = deco_unit * qty
        setup = _money(ds["setup"])
        lines.append({"label": f"Dye sublimation · {tier}+ rate × {qty}", "amount": float(deco_total)})
        lines.append({"label": "Art / print setup", "amount": float(setup)})
    else:
        raise ValueError("method must be embroidery, screen, or dye-sub")

    subtotal = garment_total + deco_total + setup
    each = _money(subtotal / qty) if qty else subtotal
    return {
        "ok": True,
        "quantity": qty,
        "qtyTier": tier,
        "garment": g,
        "method": method,
        "perPieceDecoration": float(deco_unit),
        "each": float(each),
        "subtotal": float(_money(subtotal)),
        "lines": lines,
        "disclaimer": meta["disclaimer"],
        "contactEmail": meta["contactEmail"],
        "contactPhone": meta["contactPhone"],
    }
