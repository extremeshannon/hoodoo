"""Render dye-sub print packs: per-piece 300 DPI PNG, 44in nest, CLO map, job.json."""

from __future__ import annotations

import io
import json
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from xml.sax.saxutils import escape

from PIL import Image, ImageDraw, ImageFont

MM_PER_IN = 25.4
BRAND = (54, 180, 229, 255)
INK = (10, 11, 13, 255)


def _hex_rgb(hexv: str, default: tuple[int, int, int] = (54, 180, 229)) -> tuple[int, int, int]:
    h = str(hexv or "").strip().lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    if len(h) < 6:
        return default
    try:
        return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    except ValueError:
        return default


def _piece_by_id(garment: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {str(p["id"]): p for p in garment.get("pieces") or [] if p.get("id")}


def _y_down_poly(pts_mm: list[list[float]], height_mm: float) -> list[tuple[float, float]]:
    return [(float(x), height_mm - float(y)) for x, y in pts_mm]


def _poly_px(
    pts_ydown_mm: list[tuple[float, float]],
    dpi: int,
    ox_in: float,
    oy_in: float,
) -> list[tuple[int, int]]:
    s = dpi / MM_PER_IN
    ox = ox_in * dpi
    oy = oy_in * dpi
    return [(int(round(x * s + ox)), int(round(y * s + oy))) for x, y in pts_ydown_mm]


def _decimate(pts: list[tuple[float, float]], maxn: int = 360) -> list[tuple[float, float]]:
    n = len(pts)
    if n <= maxn or maxn < 3:
        return pts
    step = n / float(maxn)
    out = [pts[min(n - 1, int(i * step))] for i in range(maxn)]
    if out[-1] != pts[-1]:
        out.append(pts[-1])
    return out


def _flip_x(im: Image.Image) -> Image.Image:
    transpose = getattr(Image, "Transpose", None)
    if transpose is not None:
        return im.transpose(transpose.FLIP_LEFT_RIGHT)
    return im.transpose(Image.FLIP_LEFT_RIGHT)


def _open_art(blob: bytes) -> Image.Image:
    im = Image.open(io.BytesIO(blob))
    if im.mode not in ("RGBA", "RGB"):
        im = im.convert("RGBA")
    elif im.mode == "RGB":
        im = im.convert("RGBA")
    return im


def _paste_placement(
    canvas: Image.Image,
    art: Image.Image,
    x_in: float,
    y_in: float,
    w_in: float,
    h_in: float,
    rot_deg: float,
    dpi: int,
    ox_in: float,
    oy_in: float,
    flip_x: bool = False,
) -> None:
    tw = max(1, int(round(w_in * dpi)))
    th = max(1, int(round(h_in * dpi)))
    resized = art.resize((tw, th), Image.Resampling.BILINEAR)
    if flip_x:
        resized = _flip_x(resized)
    rot = float(rot_deg or 0)
    if rot:
        resized = resized.rotate(-rot, expand=True, resample=Image.Resampling.BICUBIC)
    cx = (ox_in + x_in + w_in / 2.0) * dpi
    cy = (oy_in + y_in + h_in / 2.0) * dpi
    px = int(round(cx - resized.width / 2.0))
    py = int(round(cy - resized.height / 2.0))
    canvas.alpha_composite(resized, (px, py))


def render_piece_png(
    piece: dict[str, Any],
    placements: list[dict[str, Any]],
    arts: dict[str, bytes],
    *,
    dpi: int,
    bleed_in: float,
    base_hex: str,
    include_guides: bool = True,
) -> bytes:
    cut_w = float(piece["cutWin"])
    cut_h = float(piece["cutHin"])
    height_mm = cut_h * MM_PER_IN
    cut_yd = _decimate(_y_down_poly(piece.get("cutMm") or [], height_mm))
    sew_yd = _decimate(_y_down_poly(piece.get("sewMm") or [], height_mm)) if piece.get("sewMm") else []
    img_w = max(1, int(round((cut_w + bleed_in * 2) * dpi)))
    img_h = max(1, int(round((cut_h + bleed_in * 2) * dpi)))
    rgb = _hex_rgb(base_hex)
    # One RGBA canvas: fabric fill + art. Masking the cut shape at 300 DPI OOMs the shop box.
    canvas = Image.new("RGBA", (img_w, img_h), (*rgb, 255))

    for pl in placements:
        art_id = str(pl.get("artId") or "")
        blob = arts.get(art_id)
        if not blob:
            continue
        try:
            art = _open_art(blob)
        except Exception:
            continue
        _paste_placement(
            canvas,
            art,
            float(pl.get("xIn") or 0),
            float(pl.get("yIn") or 0),
            max(0.05, float(pl.get("wIn") or 1)),
            max(0.05, float(pl.get("hIn") or 1)),
            float(pl.get("rotationDeg") or 0),
            dpi,
            bleed_in,
            bleed_in,
            bool(pl.get("flipX")),
        )
        art.close()

    cut_px = _poly_px(cut_yd, dpi, bleed_in, bleed_in)
    if include_guides and len(cut_px) >= 2:
        draw = ImageDraw.Draw(canvas)
        draw.line(cut_px + [cut_px[0]], fill=(255, 0, 255, 180), width=max(1, dpi // 150))
        if len(sew_yd) >= 2:
            sew_px = _poly_px(sew_yd, dpi, bleed_in, bleed_in)
            draw.line(sew_px + [sew_px[0]], fill=(54, 180, 229, 200), width=max(1, dpi // 200))

    out = canvas.convert("RGB")
    canvas.close()
    buf = io.BytesIO()
    out.save(buf, format="PNG", dpi=(dpi, dpi), compress_level=3)
    out.close()
    return buf.getvalue()


def _label_strip(draw: ImageDraw.ImageDraw, x: int, y: int, text: str, dpi: int) -> None:
    try:
        font = ImageFont.load_default()
    except Exception:
        font = None
    draw.text((x, y), text, fill=INK, font=font)


def nest_pieces(
    rendered: list[tuple[dict[str, Any], Image.Image]],
    *,
    roll_width_in: float,
    dpi: int,
    gap_in: float = 0.35,
) -> tuple[bytes, list[dict[str, Any]]]:
    gap = int(round(gap_in * dpi))
    roll_px = max(1, int(round(roll_width_in * dpi)))
    label_h = int(round(0.35 * dpi))
    # Shelf pack, tallest-first.
    items = sorted(rendered, key=lambda t: t[1].height, reverse=True)
    x = gap
    y = gap
    row_h = 0
    positions: list[dict[str, Any]] = []
    placed: list[tuple[int, int, Image.Image, dict[str, Any]]] = []
    for piece, im in items:
        w, h = im.size
        need_w = w + gap
        need_h = h + label_h + gap
        if x > gap and x + need_w > roll_px:
            x = gap
            y += row_h
            row_h = 0
        if w + gap * 2 > roll_px:
            # Scale down a piece that cannot fit the roll (should not happen at 44").
            scale = (roll_px - gap * 2) / float(w)
            im = im.resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.Resampling.LANCZOS)
            w, h = im.size
            need_w = w + gap
            need_h = h + label_h + gap
        placed.append((x, y + label_h, im, piece))
        positions.append(
            {
                "pieceId": piece["id"],
                "dxf": piece.get("dxf"),
                "xIn": round(x / dpi, 4),
                "yIn": round((y + label_h) / dpi, 4),
                "wIn": round(w / dpi, 4),
                "hIn": round(h / dpi, 4),
            }
        )
        x += need_w
        row_h = max(row_h, need_h)
    nest_h = y + row_h + gap
    nest = Image.new("RGB", (roll_px, max(nest_h, gap * 2 + 10)), (255, 255, 255))
    draw = ImageDraw.Draw(nest)
    for px, py, im, piece in placed:
        nest.paste(im.convert("RGB"), (px, py))
        label = f"{piece.get('label') or piece['id']}  {piece.get('dxf') or ''}  {piece['cutWin']:.2f}x{piece['cutHin']:.2f}in"
        _label_strip(draw, px, py - label_h + 4, label, dpi)
    buf = io.BytesIO()
    nest.save(buf, format="PNG", dpi=(dpi, dpi))
    return buf.getvalue(), positions


def _cut_svg(piece: dict[str, Any]) -> str:
    w = float(piece["cutWin"])
    h = float(piece["cutHin"])
    height_mm = h * MM_PER_IN
    pts = _y_down_poly(piece.get("cutMm") or [], height_mm)
    if not pts:
        return ""
    d = []
    for i, (x, y) in enumerate(pts):
        xin = x / MM_PER_IN
        yin = y / MM_PER_IN
        d.append(("M" if i == 0 else "L") + f" {xin:.4f} {yin:.4f}")
    d.append("Z")
    path = " ".join(d)
    label = escape(str(piece.get("label") or piece.get("id") or ""))
    dxf = escape(str(piece.get("dxf") or ""))
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="{w:.4f}in" height="{h:.4f}in" viewBox="0 0 {w:.4f} {h:.4f}">
  <title>{label} · {dxf}</title>
  <path d="{path}" fill="none" stroke="#ff00ff" stroke-width="0.01"/>
</svg>
"""


def build_dyesub_zip(
    *,
    garment: dict[str, Any],
    job_meta: dict[str, Any],
    layout: dict[str, Any],
    arts: dict[str, tuple[str, str, bytes]],
    repo_root: Path | None = None,
) -> bytes:
    """arts: artId -> (filename, mime, bytes)."""
    dpi = int(garment.get("artDpi") or 300)
    bleed = float(garment.get("bleedIn") or 0.25)
    roll = float(garment.get("rollWidthIn") or 44)
    nest_dpi = 72
    base_colors = dict(layout.get("baseColors") or {})
    default_hex = str(layout.get("baseColor") or "#36B4E5")
    placements = list(layout.get("placements") or [])
    by_piece: dict[str, list[dict[str, Any]]] = {}
    for pl in placements:
        pid = str(pl.get("pieceId") or "")
        if pid:
            by_piece.setdefault(pid, []).append(pl)
    art_blobs = {k: v[2] for k, v in arts.items()}
    now = datetime.now(timezone.utc)
    job_id = str(job_meta.get("id") or f"hoodoo-{now.strftime('%Y%m%d-%H%M%S')}")
    pieces = list(garment.get("pieces") or [])
    nest_thumbs: list[tuple[dict[str, Any], Image.Image]] = []
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for piece in pieces:
            pid = str(piece["id"])
            hexv = base_colors.get(pid) or base_colors.get(str(piece.get("role") or "")) or default_hex
            png = render_piece_png(
                piece,
                by_piece.get(pid) or [],
                art_blobs,
                dpi=dpi,
                bleed_in=bleed,
                base_hex=str(hexv),
                include_guides=True,
            )
            safe = pid.replace("/", "-")
            clo_name = str(piece.get("dxf") or pid).replace("/", "-").replace(" ", "_")
            z.writestr(f"PRINT/{safe}.png", png)
            z.writestr(f"CLO/{clo_name}.png", png)
            svg = _cut_svg(piece)
            if svg:
                z.writestr(f"CUT/{safe}.svg", svg)
            im = Image.open(io.BytesIO(png)).convert("RGB")
            scale = nest_dpi / float(dpi)
            thumb = im.resize(
                (max(1, int(im.width * scale)), max(1, int(im.height * scale))),
                Image.Resampling.BILINEAR,
            )
            im.close()
            nest_thumbs.append((piece, thumb))
            del png

        nest_png, nest_pos = nest_pieces(nest_thumbs, roll_width_in=roll, dpi=nest_dpi, gap_in=0.35)
        for _piece, thumb in nest_thumbs:
            thumb.close()
        z.writestr("NEST/roll-44in.png", nest_png)
        z.writestr("NEST/layout.json", json.dumps({"rollWidthIn": roll, "dpi": nest_dpi, "positions": nest_pos}, indent=2))

        for art_id, (fname, mime, blob) in arts.items():
            ext = "png"
            lower = (fname or "").lower()
            if lower.endswith(".jpg") or lower.endswith(".jpeg") or (mime or "").find("jpeg") >= 0:
                ext = "jpg"
            elif lower.endswith(".webp"):
                ext = "webp"
            safe_name = "".join(c if c.isalnum() or c in "._-" else "_" for c in (fname or "art"))[:80] or "art"
            if not safe_name.lower().endswith("." + ext):
                safe_name = safe_name + "." + ext
            z.writestr(f"ART/{art_id[:8]}-{safe_name}", blob)

        piece_map = [
            {
                "pieceId": p["id"],
                "cloPieceName": p.get("dxf"),
                "printPng": f"PRINT/{p['id']}.png",
                "cloPng": f"CLO/{str(p.get('dxf') or p['id']).replace(' ', '_')}.png",
                "cutSvg": f"CUT/{p['id']}.svg",
                "cutWin": p.get("cutWin"),
                "cutHin": p.get("cutHin"),
                "dpi": dpi,
                "bleedIn": bleed,
            }
            for p in pieces
        ]
        spec = {
            "jobId": job_id,
            "name": job_meta.get("name") or "",
            "shop": "Hoodoo Alaska",
            "address": "7362 W Parks Hwy PMB 213, Wasilla, AK 99623",
            "phone": "907.202.5634",
            "email": "shannnon@hoodooak.com",
            "createdUtc": now.isoformat(),
            "garment": {
                "id": garment.get("id"),
                "name": garment.get("name"),
                "product": garment.get("product"),
                "fit": garment.get("fit"),
                "size": garment.get("size"),
            },
            "printer": garment.get("printer") or {"name": "Epson SureColor F6200", "rollWidthIn": roll, "artDpi": dpi},
            "seamAllowanceIn": garment.get("seamAllowanceIn"),
            "bleedIn": bleed,
            "artDpi": dpi,
            "layout": {
                "baseColor": default_hex,
                "baseColors": base_colors,
                "placements": placements,
            },
            "pieces": piece_map,
            "customer": job_meta.get("customer") or {},
            "notes": job_meta.get("notes") or layout.get("notes") or "",
        }
        z.writestr("job.json", json.dumps(spec, indent=2))
        z.writestr("CLO/piece-map.json", json.dumps(piece_map, indent=2))

        dxf_rel = ((garment.get("files") or {}).get("dxf")) if isinstance(garment.get("files"), dict) else None
        if dxf_rel and repo_root:
            dxf_path = Path(repo_root) / str(dxf_rel)
            if dxf_path.is_file():
                z.write(dxf_path, "CLO/" + dxf_path.name)
        pdf_rel = ((garment.get("files") or {}).get("patternPdf")) if isinstance(garment.get("files"), dict) else None
        if pdf_rel and repo_root:
            pdf_path = Path(repo_root) / str(pdf_rel)
            if pdf_path.is_file():
                z.write(pdf_path, "CLO/" + pdf_path.name)

        z.writestr(
            "README.txt",
            "HOODOO ALASKA — dye-sub print pack (Male Freefly Jacket / CLO3D)\n"
            "\n"
            "PRINT/{piece}.png     300 DPI RGB, cut size + 0.25 in bleed. Magenta = cut, cyan = sew.\n"
            "CLO/{CLO piece}.png   Same files named for CLO3D pattern pieces. Import as fabric/print maps.\n"
            "CLO/MaleJacket.dxf    Original CLO ASTM DXF (layer 84 cut, 87 sew). Import into CLO3D.\n"
            "CLO/piece-map.json    CLO piece name → PNG.\n"
            "CUT/{piece}.svg       1:1 inch cut outlines for the plotter.\n"
            "NEST/roll-44in.png    Nested on 44 in Epson SureColor F6200 roll (72 DPI layout preview).\n"
            "ART/                  Original uploaded artwork.\n"
            "job.json              Placement transforms, sizes, customer, shop contacts.\n"
            "\n"
            "Print: send PRINT PNGs or the nest to the F6200 RIP at 720 DPI. Do not rescale.\n"
            "CLO: File → Import DXF, then assign each CLO/*.png to the matching pattern piece.\n",
        )
    return buf.getvalue()


def piece_pixel_size(piece: dict[str, Any], dpi: int, bleed_in: float) -> tuple[int, int]:
    w = max(1, int(round((float(piece["cutWin"]) + bleed_in * 2) * dpi)))
    h = max(1, int(round((float(piece["cutHin"]) + bleed_in * 2) * dpi)))
    return w, h
