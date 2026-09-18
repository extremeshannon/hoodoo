"""Load dye-sub garment piece maps from data/dyesub/."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from fastapi import HTTPException, status


def dyesub_dir(repo_root: Path) -> Path:
    return Path(repo_root) / "data" / "dyesub"


def load_garment_index(repo_root: Path) -> list[dict[str, Any]]:
    path = dyesub_dir(repo_root) / "garments.json"
    if not path.is_file():
        return []
    raw = json.loads(path.read_text(encoding="utf-8"))
    return list(raw.get("garments") or [])


def resolve_garment_id(repo_root: Path, garment_id: str | None, product: str | None, fit: str | None) -> str | None:
    gid = (garment_id or "").strip()
    if gid:
        return gid
    product_s = (product or "").strip()
    fit_s = (fit or "").strip()
    if not product_s:
        return None
    for g in load_garment_index(repo_root):
        if g.get("product") == product_s and (not fit_s or g.get("fit") == fit_s):
            return str(g["id"])
    return None


@lru_cache(maxsize=32)
def _load_pieces_cached(path_str: str, mtime: float) -> dict[str, Any]:
    return json.loads(Path(path_str).read_text(encoding="utf-8"))


def load_garment(repo_root: Path, garment_id: str) -> dict[str, Any]:
    idx = {str(g["id"]): g for g in load_garment_index(repo_root)}
    meta = idx.get(garment_id)
    if not meta:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown garment")
    pieces_name = str(meta.get("piecesFile") or f"{garment_id}-pieces.json")
    path = dyesub_dir(repo_root) / pieces_name
    if not path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Garment pieces not found")
    data = _load_pieces_cached(str(path), path.stat().st_mtime)
    out = dict(data)
    out["id"] = garment_id
    out["product"] = meta.get("product") or out.get("product")
    out["fit"] = meta.get("fit") or out.get("fit")
    out["name"] = meta.get("name") or out.get("name")
    out["size"] = meta.get("size") or out.get("size")
    out["ready"] = bool(meta.get("ready", True))
    return out


def list_garments_public(repo_root: Path) -> list[dict[str, Any]]:
    rows = []
    for g in load_garment_index(repo_root):
        rows.append(
            {
                "id": g.get("id"),
                "product": g.get("product"),
                "fit": g.get("fit"),
                "name": g.get("name"),
                "size": g.get("size"),
                "ready": bool(g.get("ready", True)),
            }
        )
    return rows
