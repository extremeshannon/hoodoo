"""Build a shop-ready print/cut pack (zip) from a jumpsuit or apparel job."""

from __future__ import annotations

import base64
import io
import json
import re
import struct
import zipfile
import zlib
from datetime import datetime, timezone
from typing import Any
from xml.sax.saxutils import escape


PIECES = [
    ("front-torso", "Front torso", 8.5, 11.0),
    ("back-torso", "Back torso", 8.5, 11.0),
    ("left-sleeve", "Left sleeve", 6.0, 10.0),
    ("right-sleeve", "Right sleeve", 6.0, 10.0),
    ("left-leg", "Left leg", 7.0, 14.0),
    ("right-leg", "Right leg", 7.0, 14.0),
    ("collar", "Collar", 5.0, 2.5),
    ("bootie-left", "Bootie left", 5.0, 4.0),
    ("bootie-right", "Bootie right", 5.0, 4.0),
]

PART_PIECES = {
    "torso": ["front-torso", "back-torso"],
    "arms": ["left-sleeve", "right-sleeve"],
    "legs": ["left-leg", "right-leg"],
    "booties": ["bootie-left", "bootie-right"],
    "collar": ["collar"],
}

_DATAURL = re.compile(r"^data:(image/[\w.+-]+);base64,(.+)$", re.I | re.S)

DEFAULT_COLORS = {
    "torso": "#36B4E5",
    "arms": "#0a0b0d",
    "legs": "#0a0b0d",
    "booties": "#36B4E5",
    "collar": "#e8ecf1",
    "cordura": "#1c2229",
    "trim": "#36B4E5",
    "stitch": "#0a0b0d",
    "body": "#000000",
    "embroidery": "#FFFFFF",
}


def _svg_rect(name: str, label: str, fill: str, w_in: float, h_in: float, bleed_in: float = 0.25) -> str:
    dpi = 96
    pad = bleed_in * dpi
    w = w_in * dpi + pad * 2
    h = h_in * dpi + pad * 2
    fill = fill if fill.startswith("#") else "#" + fill
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="{w:.1f}" height="{h:.1f}" viewBox="0 0 {w:.1f} {h:.1f}">
  <title>{escape(label)}</title>
  <rect x="0" y="0" width="{w:.1f}" height="{h:.1f}" fill="#111"/>
  <rect x="{pad:.1f}" y="{pad:.1f}" width="{w_in * dpi:.1f}" height="{h_in * dpi:.1f}" fill="{escape(fill)}" stroke="#36B4E5" stroke-width="2"/>
  <text x="{w / 2:.1f}" y="{h / 2:.1f}" fill="#0a0b0d" font-family="Arial, sans-serif" font-size="18" text-anchor="middle">{escape(label)}</text>
  <text x="{w / 2:.1f}" y="{h / 2 + 22:.1f}" fill="#0a0b0d" font-family="Arial, sans-serif" font-size="12" text-anchor="middle">{escape(name)} · {escape(fill)} · bleed {bleed_in}in</text>
</svg>
"""


def _colorway_svg(parts: dict[str, str], title: str, names: dict[str, str] | None = None) -> str:
    rows = []
    y = 70
    names = names or {}
    for i, (k, hexv) in enumerate(parts.items()):
        yy = y + i * 36
        label = f"{k}  {names[k]}  {hexv}" if names.get(k) else f"{k}  {hexv}"
        rows.append(
            f'<rect x="40" y="{yy}" width="36" height="28" fill="{escape(hexv)}" stroke="#36B4E5"/>'
            f'<text x="88" y="{yy + 20}" fill="#e8ecf1" font-family="Arial" font-size="14">{escape(label)}</text>'
        )
    h = y + len(parts) * 36 + 40
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="640" height="{h}" viewBox="0 0 640 {h}">
  <rect width="640" height="{h}" fill="#0a0b0d"/>
  <text x="40" y="36" fill="#36B4E5" font-family="Arial" font-size="22" font-weight="700">{escape(title)}</text>
  {''.join(rows)}
</svg>
"""


def _rgb_from_hex(hexv: str) -> tuple[int, int, int]:
    h = str(hexv or "").strip().lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    if len(h) < 6:
        h = (h + "000000")[:6]
    try:
        return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    except ValueError:
        return 54, 180, 229


def _png_chunk(tag: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)


def _solid_png(hexv: str, size: int = 2048) -> bytes:
    r, g, b = _rgb_from_hex(hexv)
    row = b"\x00" + bytes((r, g, b)) * size
    compressed = zlib.compress(row * size, 9)
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + _png_chunk(b"IHDR", ihdr) + _png_chunk(b"IDAT", compressed) + _png_chunk(b"IEND", b"")


def _normalize_colors(raw: Any) -> dict[str, str]:
    colors: dict[str, str] = dict(DEFAULT_COLORS)
    if not isinstance(raw, dict):
        return colors
    for k, v in raw.items():
        if isinstance(v, dict):
            hexv = str(v.get("color") or v.get("hex") or "")
        else:
            hexv = str(v or "")
        if hexv:
            if not hexv.startswith("#"):
                hexv = "#" + hexv
            colors[str(k)] = hexv
    return colors


def _part_meta(job: dict[str, Any], key: str) -> dict[str, str]:
    meta = {"name": "", "material": "", "embroideryText": ""}
    raw = job.get("partDetails") if isinstance(job.get("partDetails"), dict) else {}
    if not raw:
        raw = job.get("parts") if isinstance(job.get("parts"), dict) else {}
    v = raw.get(key)
    if isinstance(v, dict):
        meta["name"] = str(v.get("name") or "")
        meta["material"] = str(v.get("material") or "")
        meta["embroideryText"] = str(v.get("embroideryText") or "")
    if key == "embroidery" and not meta["embroideryText"]:
        meta["embroideryText"] = str(job.get("embroideryText") or "")
    return meta


def _decode_art(value: Any) -> tuple[bytes, str] | None:
    if not value or not isinstance(value, str):
        return None
    s = value.strip()
    m = _DATAURL.match(s)
    if m:
        mime = m.group(1).lower()
        try:
            blob = base64.b64decode(m.group(2))
        except Exception:
            return None
        if "jpeg" in mime or mime.endswith("/jpg"):
            ext = "jpg"
        elif "webp" in mime:
            ext = "webp"
        else:
            ext = "png"
        return blob, ext
    if len(s) > 64 and not s.startswith("#"):
        try:
            return base64.b64decode(s), "png"
        except Exception:
            return None
    return None


def build_pack_zip(job: dict[str, Any]) -> bytes:
    now = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    job_id = str(job.get("jobId") or f"hoodoo-{now}")
    pattern = str(job.get("pattern") or "freefly")
    colors = _normalize_colors(job.get("parts"))
    art_in: dict[str, Any] = dict(job.get("art") or {})
    sizing = job.get("sizing") or {}
    buf = io.BytesIO()
    panels: dict[str, dict[str, str]] = {}
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for part_id, hexv in colors.items():
            decoded = _decode_art(art_in.get(part_id))
            if decoded:
                blob, ext = decoded
            else:
                blob, ext = _solid_png(hexv), "png"
            art_name = f"ART/{part_id}.{ext}"
            z.writestr(art_name, blob)
            meta = _part_meta(job, part_id)
            panels[part_id] = {
                "color": hexv,
                "name": meta["name"],
                "material": meta["material"],
                "art": art_name,
            }
            if meta.get("embroideryText"):
                panels[part_id]["embroideryText"] = meta["embroideryText"]

        spec = {
            "jobId": job_id,
            "shop": "Hoodoo Alaska",
            "address": "7362 W Parks Hwy PMB 213, Wasilla, AK 99623",
            "phone": "907.202.5634",
            "email": "shannnon@hoodooak.com",
            "createdUtc": datetime.now(timezone.utc).isoformat(),
            "pattern": pattern,
            "product": job.get("product") or "",
            "productName": job.get("productName") or "",
            "fit": job.get("fit") or "",
            "parts": panels,
            "colors": colors,
            "embroideryText": job.get("embroideryText") or (panels.get("embroidery") or {}).get("embroideryText") or "",
            "sizing": sizing,
            "notes": job.get("notes") or "",
            "customer": job.get("customer") or {},
        }
        z.writestr("job.json", json.dumps(spec, indent=2))
        color_names = {k: (panels.get(k) or {}).get("name") or "" for k in colors}
        z.writestr("COLOR/colorway.svg", _colorway_svg(colors, f"Hoodoo colorway · {job_id}", color_names))
        z.writestr(
            "COLOR/colorway.txt",
            "\n".join(
                f"{k}\t{panels[k].get('name') or ''}\t{v}\t{panels[k].get('material') or ''}\t{panels[k]['art']}"
                for k, v in colors.items()
            )
            + "\n",
        )
        piece_color = {
            "front-torso": colors.get("torso", "#36B4E5"),
            "back-torso": colors.get("torso", "#36B4E5"),
            "left-sleeve": colors.get("arms", "#0a0b0d"),
            "right-sleeve": colors.get("arms", "#0a0b0d"),
            "left-leg": colors.get("legs", "#0a0b0d"),
            "right-leg": colors.get("legs", "#0a0b0d"),
            "collar": colors.get("collar", "#e8ecf1"),
            "bootie-left": colors.get("booties", "#36B4E5"),
            "bootie-right": colors.get("booties", "#36B4E5"),
        }
        for name, label, w, h in PIECES:
            fill = piece_color.get(name, "#36B4E5")
            z.writestr(f"ART/{name}.svg", _svg_rect(name, label, fill, w, h))
            z.writestr(f"CUT/{name}.svg", _svg_rect(name, label + " CUT", "#ffffff", w, h, 0.0))
        z.writestr(
            "README.txt",
            "HOODOO ALASKA — print & cut pack\n"
            "COLOR/     colorway chips + hex list (print this for the floor)\n"
            "ART/{part}.png  dye-sub art per configurator part (uploaded image or 2048 solid color)\n"
            "ART/*.svg  panel placeholders with 0.25in bleed\n"
            "CUT/       plotter outlines (replace geometry with CLO3D DXF/SVG exports in 3d/clo/)\n"
            "job.json   part → color + art filename for the sew table\n",
        )
    return buf.getvalue()
