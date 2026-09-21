"""Load embroidery blanks (hats, ball caps, beanies) from data/embroidery/."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def _dir(repo_root: Path) -> Path:
    return Path(repo_root) / "data" / "embroidery"


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
