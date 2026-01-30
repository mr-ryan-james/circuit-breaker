#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Optional


def _run_pdftotext(pdf_path: Path) -> str:
    try:
        res = subprocess.run(
            ["pdftotext", str(pdf_path), "-"],
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        return res.stdout
    except FileNotFoundError:
        raise RuntimeError("pdftotext not found. Install with: brew install poppler")


def _require(cond: bool, msg: str) -> None:
    if not cond:
        raise RuntimeError(msg)


@dataclass(frozen=True)
class Marker:
    page_1based: int
    text: str


@dataclass(frozen=True)
class SceneSpec:
    scene: int
    start: Marker
    end: Marker
    out_name: str


def _find_marker_rect(page, marker_text: str):
    rects = page.search_for(marker_text)
    if not rects:
        return None
    # pick the earliest on the page (top-most, then left-most)
    rects = sorted(rects, key=lambda r: (r.y0, r.x0))
    return rects[0]


def _copy_clipped_page(out_doc, src_doc, page_index0: int, clip):
    src_page = src_doc[page_index0]
    width = clip.x1 - clip.x0
    height = clip.y1 - clip.y0
    _require(width > 1 and height > 1, f"Invalid clip rect for page {page_index0+1}: {clip}")
    new_page = out_doc.new_page(width=width, height=height)
    # Place clipped region into new page coordinates
    import fitz  # type: ignore

    new_page.show_pdf_page(
        fitz.Rect(0, 0, width, height),
        src_doc,
        page_index0,
        clip=clip,
    )


def extract_scene_pdf(
    src_pdf: Path,
    out_pdf: Path,
    start: Marker,
    end: Marker,
    start_pad_pt: float,
    end_pad_pt: float,
) -> dict:
    import fitz  # type: ignore

    _require(src_pdf.exists(), f"Input PDF not found: {src_pdf}")

    doc = fitz.open(str(src_pdf))
    _require(doc.page_count >= max(start.page_1based, end.page_1based), "PDF has fewer pages than expected")

    start_idx0 = start.page_1based - 1
    end_idx0 = end.page_1based - 1
    _require(start_idx0 <= end_idx0, "Start page must be <= end page")

    start_page = doc[start_idx0]
    end_page = doc[end_idx0]

    start_rect = _find_marker_rect(start_page, start.text)
    end_rect = _find_marker_rect(end_page, end.text)
    _require(start_rect is not None, f'Marker "{start.text}" not found on page {start.page_1based}')
    _require(end_rect is not None, f'Marker "{end.text}" not found on page {end.page_1based}')

    # Crop after the marker line (exclude marker itself + everything above).
    start_y = float(start_rect.y1) + float(start_pad_pt)
    end_y = float(end_rect.y0) - float(end_pad_pt)

    # Bounds clamp
    start_y = max(0.0, min(start_y, float(start_page.rect.y1)))
    end_y = max(0.0, min(end_y, float(end_page.rect.y1)))

    _require(end_idx0 > start_idx0 or end_y > start_y, "End marker must be below start marker (or on later page)")

    out_doc = fitz.open()

    for page0 in range(start_idx0, end_idx0 + 1):
        page = doc[page0]
        page_rect = page.rect
        clip = page_rect

        if page0 == start_idx0:
            clip = fitz.Rect(page_rect.x0, start_y, page_rect.x1, page_rect.y1)
        if page0 == end_idx0:
            clip = fitz.Rect(page_rect.x0, page_rect.y0, page_rect.x1, end_y)

        # If it's both start and end page, apply both clamps.
        if page0 == start_idx0 and page0 == end_idx0:
            clip = fitz.Rect(page_rect.x0, start_y, page_rect.x1, end_y)

        _copy_clipped_page(out_doc, doc, page0, clip)

    out_pdf.parent.mkdir(parents=True, exist_ok=True)
    out_doc.save(str(out_pdf), deflate=True)
    out_doc.close()
    doc.close()

    return {
        "output": str(out_pdf),
        "pages_used": list(range(start.page_1based, end.page_1based + 1)),
        "start_marker": {"page": start.page_1based, "text": start.text},
        "end_marker": {"page": end.page_1based, "text": end.text},
    }


def verify_scene_pdf(out_pdf: Path, forbidden_markers: list[str]) -> dict:
    text = _run_pdftotext(out_pdf)
    violations = []
    warnings = []
    for m in forbidden_markers:
        if m in text:
            violations.append({"type": "marker_present", "marker": m})
    # Watermarks are not fatal (we sanitize at import), but we report if present.
    lower = text.lower()
    if "copioni.corrierespettacolo.it" in lower or "http://" in lower or "https://" in lower:
        warnings.append({"type": "watermark_present"})
    return {"ok": len(violations) == 0, "violations": violations, "warnings": warnings}


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp", required=True, help="Input PDF path")
    ap.add_argument("--out-dir", required=True, help="Output directory")
    ap.add_argument("--verify", action="store_true", help="Run pdftotext checks on outputs")
    ap.add_argument("--scene4-start-pad-pt", type=float, default=2.0)
    ap.add_argument("--scene4-end-pad-pt", type=float, default=2.0)
    ap.add_argument("--scene5-start-pad-pt", type=float, default=2.0)
    ap.add_argument("--scene5-end-pad-pt", type=float, default=2.0)
    args = ap.parse_args(argv)

    inp = Path(args.inp).expanduser().resolve()
    out_dir = Path(args.out_dir).expanduser().resolve()

    # Fixed known markers for the canonical Spring Awakening PDF in this repo.
    scenes = [
        SceneSpec(
            scene=4,
            start=Marker(page_1based=17, text="SCENE 4"),
            end=Marker(page_1based=21, text="SCENE 5"),
            out_name="spring_awakening_scene4.pdf",
        ),
        SceneSpec(
            scene=5,
            start=Marker(page_1based=21, text="SCENE 5"),
            end=Marker(page_1based=24, text="SCENE 6"),
            out_name="spring_awakening_scene5.pdf",
        ),
    ]

    results = []
    ok = True
    for spec in scenes:
        out_pdf = out_dir / spec.out_name
        if spec.scene == 4:
            start_pad = args.scene4_start_pad_pt
            end_pad = args.scene4_end_pad_pt
        else:
            start_pad = args.scene5_start_pad_pt
            end_pad = args.scene5_end_pad_pt

        res = extract_scene_pdf(
            src_pdf=inp,
            out_pdf=out_pdf,
            start=spec.start,
            end=spec.end,
            start_pad_pt=start_pad,
            end_pad_pt=end_pad,
        )
        if args.verify:
            ver = verify_scene_pdf(out_pdf, forbidden_markers=[spec.start.text, spec.end.text])
            res["verify"] = ver
            if not ver["ok"]:
                ok = False
        results.append(res)

    payload = {"ok": ok, "input": str(inp), "outputs": results}
    sys.stdout.write(json.dumps(payload) + "\n")
    return 0 if ok else 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
