"""Unit tests for dye-sub piece maps and print-pack raster sizes."""

from __future__ import annotations

import io
import json
import sys
import unittest
import zipfile
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from app.dxf_astm import piece_records  # noqa: E402
from app.dyesub_pack import build_dyesub_zip, piece_pixel_size, render_piece_png  # noqa: E402


def _repo() -> Path:
    return ROOT


class DyeSubPackTests(unittest.TestCase):
    def setUp(self) -> None:
        self.garment = json.loads((_repo() / "data/dyesub/male-jacket-pieces.json").read_text())
        self.front = next(p for p in self.garment["pieces"] if p["id"] == "front-pair-a")

    def test_dxf_cut_sizes_match_spec(self) -> None:
        spec = json.loads((_repo() / "3d/clo/male-jacket/print-spec.json").read_text())
        recs = piece_records(_repo() / "3d/clo/male-jacket/MaleJacket.dxf", spec["pieces"])
        by_dxf = {r["dxf"]: r for r in recs}
        for row in spec["pieces"]:
            got = by_dxf[row["dxf"]]
            self.assertAlmostEqual(got["cutWin"], row["cutWin"], places=2)
            self.assertAlmostEqual(got["cutHin"], row["cutHin"], places=2)

    def test_piece_png_is_300dpi_cut_plus_bleed(self) -> None:
        dpi = 300
        bleed = 0.25
        png = render_piece_png(
            self.front,
            [],
            {},
            dpi=dpi,
            bleed_in=bleed,
            base_hex="#36B4E5",
            include_guides=True,
        )
        im = Image.open(io.BytesIO(png))
        w, h = piece_pixel_size(self.front, dpi, bleed)
        self.assertEqual(im.size, (w, h))
        self.assertGreater(w, 3000)
        self.assertGreater(h, 6000)

    def test_zip_contains_clo_dxf_and_named_prints(self) -> None:
        art = Image.new("RGB", (80, 40), (200, 20, 20))
        buf = io.BytesIO()
        art.save(buf, format="PNG")
        blob = buf.getvalue()
        garment = dict(self.garment)
        garment["artDpi"] = 50
        zip_bytes = build_dyesub_zip(
            garment=garment,
            job_meta={"id": "test-job", "name": "Unit test", "customer": {"email": "shop@test"}},
            layout={
                "baseColor": "#36B4E5",
                "placements": [
                    {
                        "id": "p1",
                        "artId": "a1",
                        "pieceId": "front-pair-a",
                        "xIn": 2.0,
                        "yIn": 4.0,
                        "wIn": 4.0,
                        "hIn": 2.0,
                        "rotationDeg": 15,
                    }
                ],
            },
            arts={"a1": ("logo.png", "image/png", blob)},
            repo_root=_repo(),
        )
        z = zipfile.ZipFile(io.BytesIO(zip_bytes))
        names = z.namelist()
        self.assertIn("job.json", names)
        self.assertIn("PRINT/front-pair-a.png", names)
        self.assertIn("CLO/Body_Front_3_M.png", names)
        self.assertIn("NEST/roll-44in.png", names)
        self.assertIn("CLO/MaleJacket.dxf", names)
        self.assertIn("CUT/front-pair-a.svg", names)
        job = json.loads(z.read("job.json"))
        self.assertEqual(job["printer"]["rollWidthIn"], 44)
        self.assertEqual(job["artDpi"], 50)
        nest = Image.open(io.BytesIO(z.read("NEST/roll-44in.png")))
        self.assertEqual(nest.size[0], 44 * 50)


if __name__ == "__main__":
    unittest.main()
