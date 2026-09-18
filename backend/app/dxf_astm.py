"""Parse CLO3D ASTM R12 (AC1009) DXF pattern blocks.

Cut outlines live on layer ``84`` (closed polylines). Sew lines are layer ``87``.
Coordinates are millimetres in CLO exports at 100%.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any


MM_PER_IN = 25.4
CUT_LAYER = "84"
SEW_LAYER = "87"


def _pairs(lines: list[str]) -> list[tuple[int, str]]:
    out: list[tuple[int, str]] = []
    i = 0
    n = len(lines)
    while i + 1 < n:
        code_s = lines[i].strip()
        val = lines[i + 1].rstrip("\r")
        i += 2
        try:
            code = int(code_s)
        except ValueError:
            continue
        out.append((code, val))
    return out


def _polyline_area(pts: list[tuple[float, float]]) -> float:
    if len(pts) < 3:
        return 0.0
    a = 0.0
    for i, (x1, y1) in enumerate(pts):
        x2, y2 = pts[(i + 1) % len(pts)]
        a += x1 * y2 - x2 * y1
    return abs(a) * 0.5


def _bbox(pts: list[tuple[float, float]]) -> tuple[float, float, float, float]:
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    return min(xs), min(ys), max(xs), max(ys)


def _closed(flag: int) -> bool:
    return bool(flag & 1)


def parse_astm_dxf(path: Path) -> dict[str, Any]:
    text = Path(path).read_text(encoding="latin-1", errors="replace")
    pairs = _pairs(text.splitlines())
    blocks: dict[str, dict[str, Any]] = {}
    i = 0
    n = len(pairs)
    while i < n:
        code, val = pairs[i]
        if code == 0 and val.strip() == "BLOCK":
            i += 1
            name = ""
            while i < n and not (pairs[i][0] == 0 and pairs[i][1].strip() in ("POLYLINE", "LINE", "TEXT", "INSERT", "ENDBLK")):
                if pairs[i][0] == 2 and not name:
                    name = pairs[i][1].strip()
                i += 1
            polylines: list[dict[str, Any]] = []
            texts: list[dict[str, Any]] = []
            while i < n and not (pairs[i][0] == 0 and pairs[i][1].strip() == "ENDBLK"):
                if pairs[i][0] == 0 and pairs[i][1].strip() == "POLYLINE":
                    i += 1
                    layer = "0"
                    flag = 0
                    verts: list[tuple[float, float]] = []
                    while i < n and not (pairs[i][0] == 0 and pairs[i][1].strip() in ("VERTEX", "SEQEND", "POLYLINE", "TEXT", "LINE", "INSERT", "ENDBLK")):
                        if pairs[i][0] == 8:
                            layer = pairs[i][1].strip()
                        elif pairs[i][0] == 70:
                            try:
                                flag = int(float(pairs[i][1].strip() or "0"))
                            except ValueError:
                                flag = 0
                        i += 1
                    while i < n and pairs[i][0] == 0 and pairs[i][1].strip() == "VERTEX":
                        i += 1
                        x = y = None
                        while i < n and pairs[i][0] != 0:
                            if pairs[i][0] == 10:
                                x = float(pairs[i][1])
                            elif pairs[i][0] == 20:
                                y = float(pairs[i][1])
                            i += 1
                        if x is not None and y is not None:
                            verts.append((x, y))
                    if i < n and pairs[i][0] == 0 and pairs[i][1].strip() == "SEQEND":
                        i += 1
                    if len(verts) >= 3:
                        polylines.append(
                            {
                                "layer": layer,
                                "closed": _closed(flag) or verts[0] == verts[-1],
                                "points": verts,
                                "area": _polyline_area(verts[:-1] if verts[0] == verts[-1] else verts),
                            }
                        )
                    continue
                if pairs[i][0] == 0 and pairs[i][1].strip() == "TEXT":
                    i += 1
                    tlayer = "0"
                    tval = ""
                    tx = ty = 0.0
                    while i < n and pairs[i][0] != 0:
                        if pairs[i][0] == 8:
                            tlayer = pairs[i][1].strip()
                        elif pairs[i][0] == 1:
                            tval = pairs[i][1]
                        elif pairs[i][0] == 10:
                            tx = float(pairs[i][1])
                        elif pairs[i][0] == 20:
                            ty = float(pairs[i][1])
                        i += 1
                    if tval.strip():
                        texts.append({"layer": tlayer, "text": tval.strip(), "x": tx, "y": ty})
                    continue
                i += 1
            if name:
                blocks[name] = {"name": name, "polylines": polylines, "texts": texts}
            continue
        i += 1
    return {"blocks": blocks}


def _largest_closed(polylines: list[dict[str, Any]], layer: str) -> list[tuple[float, float]] | None:
    cands = [p for p in polylines if p.get("layer") == layer and p.get("closed") and len(p.get("points") or []) >= 3]
    if not cands:
        cands = [p for p in polylines if p.get("layer") == layer and len(p.get("points") or []) >= 3]
    if not cands:
        return None
    best = max(cands, key=lambda p: float(p.get("area") or 0))
    pts = list(best["points"])
    if pts[0] != pts[-1]:
        pts.append(pts[0])
    return pts


def _rel(pts: list[tuple[float, float]], ox: float, oy: float) -> list[list[float]]:
    return [[round(x - ox, 4), round(y - oy, 4)] for x, y in pts]


def piece_records(
    dxf_path: Path,
    spec_pieces: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    parsed = parse_astm_dxf(dxf_path)
    blocks = parsed["blocks"]
    out: list[dict[str, Any]] = []
    for spec in spec_pieces:
        dxf_name = str(spec["dxf"])
        block = blocks.get(dxf_name)
        if not block:
            key = next((k for k in blocks if k.replace(" ", "") == dxf_name.replace(" ", "")), None)
            block = blocks.get(key) if key else None
        if not block:
            raise KeyError(f"DXF block not found: {dxf_name}")
        cut = _largest_closed(block["polylines"], CUT_LAYER)
        if not cut:
            raise ValueError(f"No layer-{CUT_LAYER} outline for {dxf_name}")
        minx, miny, maxx, maxy = _bbox(cut)
        sew = _largest_closed(block["polylines"], SEW_LAYER)
        win = (maxx - minx) / MM_PER_IN
        hin = (maxy - miny) / MM_PER_IN
        slug = _slug(dxf_name, spec.get("role"), spec.get("side"))
        rec: dict[str, Any] = {
            "id": slug,
            "dxf": block["name"],
            "label": _label(spec, block["name"]),
            "role": spec.get("role") or "",
            "side": spec.get("side") or "",
            "cutWin": round(win, 4),
            "cutHin": round(hin, 4),
            "originMm": [round(minx, 4), round(miny, 4)],
            "cutMm": _rel(cut, minx, miny),
        }
        if sew:
            rec["sewMm"] = _rel(sew, minx, miny)
        if spec.get("note"):
            rec["note"] = spec["note"]
        out.append(rec)
    return out


def _slug(dxf: str, role: Any, side: Any) -> str:
    role_s = str(role or "piece")
    side_s = str(side or "one")
    return f"{role_s}-{side_s}".replace(" ", "-").lower()


def _label(spec: dict[str, Any], dxf: str) -> str:
    role = str(spec.get("role") or "piece").replace("-", " ").title()
    side = str(spec.get("side") or "")
    if side.startswith("pair-"):
        return f"{role} {side[-1].upper()}"
    if side:
        return f"{role} {side.replace('-', ' ').title()}"
    return dxf
