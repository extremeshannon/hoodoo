"""Load screen-print blanks (vendor, model, colors, price) from data/screenprint/."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def _dir(repo_root: Path) -> Path:
    return Path(repo_root) / "data" / "screenprint"


def load_catalog(repo_root: Path) -> dict[str, Any]:
    path = _dir(repo_root) / "garments.json"
    if not path.is_file():
        return {"meta": {}, "categories": [], "locations": [], "garments": []}
    return json.loads(path.read_text(encoding="utf-8"))


def list_garments(repo_root: Path) -> dict[str, Any]:
    data = load_catalog(repo_root)
    return {
        "meta": data.get("meta") or {},
        "categories": data.get("categories") or [],
        "locations": data.get("locations") or [],
        "garments": data.get("garments") or [],
    }


def get_garment(repo_root: Path, garment_id: str) -> dict[str, Any] | None:
    gid = (garment_id or "").strip()
    if not gid:
        return None
    for g in load_catalog(repo_root).get("garments") or []:
        if str(g.get("id")) == gid:
            return g
    return None


def get_location(repo_root: Path, location_id: str) -> dict[str, Any] | None:
    lid = (location_id or "").strip()
    for loc in load_catalog(repo_root).get("locations") or []:
        if str(loc.get("id")) == lid:
            return loc
    return None


def color_of(garment: dict[str, Any], color_id: str | None) -> dict[str, Any] | None:
    cid = (color_id or "").strip()
    colors = list(garment.get("colors") or [])
    if not colors:
        return None
    if cid:
        for c in colors:
            if str(c.get("id")) == cid:
                return c
    return colors[0]
