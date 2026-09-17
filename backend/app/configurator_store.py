"""Read/write 3d/clo/manifest.json, data/materials.json, and GLB uploads."""

from __future__ import annotations

import json
import re
import threading
import time
from copy import deepcopy
from pathlib import Path
from typing import Any

_LOCK = threading.Lock()
SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
HEX_RE = re.compile(r"#?[0-9A-Fa-f]{3}([0-9A-Fa-f]{3})?")
MAX_GLB_BYTES = 50 * 1024 * 1024
PALETTE_KEYS = ("taslan", "spandex", "body", "stitch", "embroidery")
FIT_IDS = ("male", "female", "unisex", "youth")
LABELS = {
    "collar": "Collar", "front": "Front", "back": "Back", "sleeves": "Sleeves",
    "zipper": "Zipper", "waistband": "Waist Band", "stitch": "Stitch",
    "legs": "Legs", "booties": "Booties", "cordura": "Cordura", "trim": "Trim",
    "body": "Body", "embroidery": "Embroidery", "hand": "Back of hand",
    "palm": "Palm", "cuff": "Cuff", "frontTorso": "Front Torso",
    "backTorso": "Back Torso", "frontLegs": "Front Legs", "backLegs": "Back Legs",
}
PALETTE = {
    "front": "taslan", "back": "taslan", "sleeves": "taslan", "zipper": "taslan",
    "collar": "spandex", "waistband": "spandex", "stitch": "stitch", "legs": "taslan",
    "booties": "taslan", "cordura": "taslan", "trim": "taslan", "body": "body",
    "embroidery": "embroidery", "hand": "taslan", "palm": "taslan", "cuff": "spandex",
    "frontTorso": "taslan", "backTorso": "taslan", "frontLegs": "taslan", "backLegs": "taslan",
}
TEMPLATES = {
    "jacket": ["collar", "front", "back", "sleeves", "zipper", "waistband", "stitch"],
    "jumpsuit": ["collar", "frontTorso", "backTorso", "sleeves", "frontLegs", "backLegs", "zipper", "stitch"],
    "pants": ["legs", "booties", "cordura", "trim"],
    "gauntlets": ["body", "trim", "embroidery"],
    "blank": ["body", "trim", "stitch"],
}


class StoreError(ValueError):
    pass


def slugify(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", (name or "").strip().lower())
    return re.sub(r"-{2,}", "-", s).strip("-")[:80]


def clo_dir(root: Path) -> Path:
    return root / "3d" / "clo"


def manifest_path(root: Path) -> Path:
    return clo_dir(root) / "manifest.json"


def materials_path(root: Path) -> Path:
    return root / "data" / "materials.json"


def _write_json(path: Path, data: Any) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    tmp.replace(path)


def _read_json(path: Path) -> dict[str, Any]:
    if not path.is_file():
        raise StoreError(f"Missing {path.name}")
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise StoreError(f"{path.name} must be an object")
    return data


def load_manifest(root: Path) -> dict[str, Any]:
    return _read_json(manifest_path(root))


def load_materials(root: Path) -> dict[str, Any]:
    return _read_json(materials_path(root))


def norm_part(entry: Any) -> dict[str, str]:
    if isinstance(entry, str):
        pid = slugify(entry) or "part"
        return {"id": pid, "label": LABELS.get(pid, pid.replace("-", " ").title()), "palette": PALETTE.get(pid, "taslan")}
    if not isinstance(entry, dict) or not str(entry.get("id") or "").strip():
        raise StoreError("Each part needs an id")
    pid = slugify(str(entry["id"]))
    pal = str(entry.get("palette") or PALETTE.get(pid, "taslan")).lower()
    if pal not in PALETTE_KEYS:
        raise StoreError(f"Unknown palette {pal}")
    label = str(entry.get("label") or LABELS.get(pid) or pid)[:80]
    return {"id": pid, "label": label, "palette": pal}


def norm_fits(raw: Any, one_fit: bool = False) -> list[dict[str, str]]:
    ids: list[str] = []
    for item in raw or []:
        fid = item.strip().lower() if isinstance(item, str) else str((item or {}).get("id") or "").lower()
        if fid in FIT_IDS and fid not in ids:
            ids.append(fid)
    if not ids:
        ids = ["unisex"] if one_fit else ["male", "female"]
    names = {"male": "Male", "female": "Female", "unisex": "Unisex", "youth": "Youth"}
    return [{"id": i, "name": names[i]} for i in ids]


def product_index(manifest: dict[str, Any], pid: str) -> int:
    for i, p in enumerate(manifest.get("products") or []):
        if isinstance(p, dict) and p.get("id") == pid:
            return i
    raise StoreError(f"Garment not found: {pid}")


def groups_list(manifest: dict[str, Any]) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    seen: set[str] = set()
    for g in manifest.get("groups") or []:
        if not isinstance(g, dict):
            continue
        name = str(g.get("name") or "").strip()[:80]
        gid = slugify(str(g.get("id") or name))
        if not gid or gid in seen:
            continue
        seen.add(gid)
        out.append({"id": gid, "name": name or gid.replace("-", " ").title()})
    return out


def apply_group_id(product: dict[str, Any], raw: Any, groups: list[dict[str, str]]) -> None:
    gid = slugify(str(raw or ""))
    if not gid:
        product.pop("groupId", None)
        return
    valid = {g["id"] for g in groups}
    if gid not in valid:
        raise StoreError("Unknown group")
    product["groupId"] = gid


def apply_fields(
    product: dict[str, Any],
    body: dict[str, Any],
    groups: list[dict[str, str]] | None = None,
) -> dict[str, Any]:
    out = deepcopy(product)
    if body.get("name") is not None:
        name = str(body["name"]).strip()
        if not name:
            raise StoreError("Name is required")
        out["name"] = name[:120]
    if "category" in body:
        out["category"] = str(body.get("category") or "").strip()[:120]
    if body.get("blurb") is not None:
        out["blurb"] = str(body["blurb"]).strip()[:240]
    if "embroideryText" in body:
        out["embroideryText"] = bool(body["embroideryText"])
    if "awaitingFile" in body:
        af = body["awaitingFile"]
        if af:
            out["awaitingFile"] = str(af).strip()[:120]
        else:
            out.pop("awaitingFile", None)
    if "fits" in body:
        fits = norm_fits(body["fits"], bool(body.get("oneFit") or out.get("oneFit")))
        out["fits"] = fits
        out["oneFit"] = [f["id"] for f in fits] == ["unisex"] or bool(body.get("oneFit"))
    if body.get("parts") is not None:
        parts = [norm_part(p) for p in body["parts"]]
        if not parts:
            raise StoreError("Add at least one part")
        out["parts"] = parts
        out["partPalette"] = {p["id"]: p["palette"] for p in parts}
    if "meshMap" in body:
        mm = body["meshMap"] or {}
        if not isinstance(mm, dict):
            raise StoreError("meshMap must be an object")
        cleaned = {}
        for k, v in mm.items():
            names = [n.strip() for n in v.split(",")] if isinstance(v, str) else [str(n).strip() for n in (v or [])]
            names = [n for n in names if n]
            if names:
                cleaned[slugify(str(k)) or str(k)] = names
        if cleaned:
            out["meshMap"] = cleaned
        else:
            out.pop("meshMap", None)
    if "groupId" in body:
        apply_group_id(out, body.get("groupId"), groups or [])
    return out


def add_garment(root: Path, body: dict[str, Any]) -> dict[str, Any]:
    name = str(body.get("name") or "").strip()
    if not name:
        raise StoreError("Name is required")
    slug = slugify(str(body.get("id") or name))
    if not slug or not SLUG_RE.fullmatch(slug):
        raise StoreError("Could not make a slug from that name")
    tmpl = str(body.get("template") or "jacket").lower()
    if tmpl not in TEMPLATES:
        tmpl = "jacket"
    fits = norm_fits(body.get("fits"), bool(body.get("oneFit")))
    one = [f["id"] for f in fits] == ["unisex"]
    parts = [norm_part(p) for p in (body.get("parts") or TEMPLATES[tmpl])]
    (clo_dir(root) / slug).mkdir(parents=True, exist_ok=True)
    glb_by_fit = {
        f["id"]: f"/3d/clo/{slug}/{slug}.glb" if one else f"/3d/clo/{slug}/{f['id']}-{slug}.glb"
        for f in fits
    }
    product = {
        "id": slug,
        "name": name[:120],
        "category": str(body.get("category") or "").strip()[:120],
        "blurb": str(body.get("blurb") or body.get("category") or "Custom CLO3D garment.")[:240],
        "parts": parts,
        "partPalette": {p["id"]: p["palette"] for p in parts},
        "fits": fits,
        "oneFit": one,
        "glbByFit": glb_by_fit,
        "embroideryText": bool(body.get("embroideryText", any(p["id"] == "embroidery" for p in parts))),
    }
    if one:
        product["glb"] = next(iter(glb_by_fit.values()))
    with _LOCK:
        manifest = load_manifest(root)
        groups = groups_list(manifest)
        if "groupId" in body or body.get("groupId"):
            apply_group_id(product, body.get("groupId"), groups)
        products = list(manifest.get("products") or [])
        if any(isinstance(p, dict) and p.get("id") == slug for p in products):
            raise StoreError(f"Garment '{slug}' already exists")
        products.append(product)
        manifest["products"] = products
        manifest["groups"] = groups
        manifest["updatedAt"] = int(time.time())
        _write_json(manifest_path(root), manifest)
    return product


def update_garment(root: Path, pid: str, body: dict[str, Any]) -> dict[str, Any]:
    with _LOCK:
        manifest = load_manifest(root)
        idx = product_index(manifest, pid)
        updated = apply_fields(manifest["products"][idx], body, groups_list(manifest))
        manifest["products"][idx] = updated
        manifest["updatedAt"] = int(time.time())
        _write_json(manifest_path(root), manifest)
    return updated


def add_group(root: Path, body: dict[str, Any]) -> dict[str, str]:
    name = str(body.get("name") or "").strip()
    if not name:
        raise StoreError("Group name is required")
    with _LOCK:
        manifest = load_manifest(root)
        groups = groups_list(manifest)
        gid = slugify(str(body.get("id") or name))
        if not gid or not SLUG_RE.fullmatch(gid):
            raise StoreError("Could not make an id from that name")
        existing = {g["id"] for g in groups}
        if gid in existing:
            n = 2
            while f"{gid}-{n}" in existing:
                n += 1
            gid = f"{gid}-{n}"
        group = {"id": gid, "name": name[:80]}
        groups.append(group)
        manifest["groups"] = groups
        manifest["updatedAt"] = int(time.time())
        _write_json(manifest_path(root), manifest)
    return group


def rename_group(root: Path, gid: str, body: dict[str, Any]) -> dict[str, str]:
    name = str(body.get("name") or "").strip()
    if not name:
        raise StoreError("Group name is required")
    gid = slugify(gid)
    with _LOCK:
        manifest = load_manifest(root)
        groups = groups_list(manifest)
        idx = next((i for i, g in enumerate(groups) if g["id"] == gid), None)
        if idx is None:
            raise StoreError(f"Group not found: {gid}")
        groups[idx] = {"id": gid, "name": name[:80]}
        manifest["groups"] = groups
        manifest["updatedAt"] = int(time.time())
        _write_json(manifest_path(root), manifest)
    return groups[idx]


def delete_group(root: Path, gid: str) -> dict[str, Any]:
    gid = slugify(gid)
    with _LOCK:
        manifest = load_manifest(root)
        groups = groups_list(manifest)
        if not any(g["id"] == gid for g in groups):
            raise StoreError(f"Group not found: {gid}")
        groups = [g for g in groups if g["id"] != gid]
        products = []
        for p in manifest.get("products") or []:
            if isinstance(p, dict) and p.get("groupId") == gid:
                p = dict(p)
                p.pop("groupId", None)
            products.append(p)
        manifest["groups"] = groups
        manifest["products"] = products
        manifest["updatedAt"] = int(time.time())
        _write_json(manifest_path(root), manifest)
    return {"ok": True, "groups": groups}


def set_glb(root: Path, pid: str, fit: str, url: str) -> dict[str, Any]:
    fit = (fit or "").lower()
    if fit not in FIT_IDS:
        raise StoreError(f"Unknown fit {fit}")
    with _LOCK:
        manifest = load_manifest(root)
        idx = product_index(manifest, pid)
        product = deepcopy(manifest["products"][idx])
        by_fit = dict(product.get("glbByFit") or {})
        by_fit[fit] = url
        product["glbByFit"] = by_fit
        if product.get("oneFit") or fit == "unisex":
            product["glb"] = url
        product.pop("awaitingFile", None)
        manifest["products"][idx] = product
        manifest["updatedAt"] = int(time.time())
        _write_json(manifest_path(root), manifest)
    return product


def save_materials(root: Path, data: dict[str, Any]) -> dict[str, Any]:
    out = deepcopy(data)
    for key in PALETTE_KEYS:
        pal = out.get(key)
        if not isinstance(pal, dict):
            continue
        colors = []
        for c in pal.get("colors") or []:
            if not isinstance(c, dict):
                continue
            hx = str(c.get("hex") or "").strip()
            if not HEX_RE.fullmatch(hx):
                raise StoreError(f"Invalid hex {hx}")
            if not hx.startswith("#"):
                hx = "#" + hx
            if len(hx) == 4:
                hx = "#" + hx[1] * 2 + hx[2] * 2 + hx[3] * 2
            cid = slugify(str(c.get("id") or c.get("name") or "color")) or "color"
            colors.append({"id": cid, "name": str(c.get("name") or cid)[:80], "hex": hx})
        pal["colors"] = colors
        pal["id"] = pal.get("id") or key
        pal["label"] = str(pal.get("label") or key.title())[:80]
        pal["anyColor"] = False
        if "locked" in pal:
            pal["locked"] = bool(pal["locked"])
        out[key] = pal
    if isinstance(out.get("parts"), dict):
        parts = {}
        for k, v in out["parts"].items():
            pal = str(v).lower()
            if pal not in PALETTE_KEYS:
                raise StoreError(f"Unknown palette for {k}")
            parts[slugify(str(k)) or str(k)] = pal
        out["parts"] = parts
    with _LOCK:
        _write_json(materials_path(root), out)
    return out


def save_maps(root: Path, mesh_map: dict[str, Any] | None = None, mesh_notes: dict[str, Any] | None = None) -> dict[str, Any]:
    with _LOCK:
        manifest = load_manifest(root)
        if mesh_map is not None:
            cleaned = {}
            for k, v in (mesh_map or {}).items():
                names = [n.strip() for n in v.split(",")] if isinstance(v, str) else [str(n).strip() for n in (v or [])]
                names = [n for n in names if n]
                if names:
                    cleaned[slugify(str(k)) or str(k)] = names
            manifest["meshMap"] = cleaned
        if mesh_notes is not None:
            if not isinstance(mesh_notes, dict):
                raise StoreError("meshNotes must be an object")
            manifest["meshNotes"] = mesh_notes
        manifest["updatedAt"] = int(time.time())
        _write_json(manifest_path(root), manifest)
    return manifest


def snapshot(root: Path) -> dict[str, Any]:
    manifest = load_manifest(root)
    products = []
    for raw in manifest.get("products") or []:
        if not isinstance(raw, dict):
            continue
        p = deepcopy(raw)
        p["parts"] = [norm_part(x) for x in (p.get("parts") or [])]
        products.append(p)
    return {
        "products": products,
        "groups": groups_list(manifest),
        "materials": load_materials(root),
        "meshMap": manifest.get("meshMap") or {},
        "meshNotes": manifest.get("meshNotes") or {},
        "fits": manifest.get("fits") or [],
        "paletteKeys": list(PALETTE_KEYS),
        "templates": list(TEMPLATES.keys()),
        "maxGlbBytes": MAX_GLB_BYTES,
        "updatedAt": manifest.get("updatedAt"),
    }
