#!/usr/bin/env python3
"""Lossless, reversible PNG-to-WebP experiment for KURMET UNIVERSE.

Run from repository root:
    python -m pip install Pillow
    python tools/optimize_png.py

The source PNGs are NEVER edited, and index.html is NEVER modified.
Outputs are only written under optimized/ in the experimental branch.
Each result is decoded and compared to the source for identical visible pixels
(including transparency) before it can be kept.
"""
from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "optimized"
ASSETS = (
    "локация пещера.png",
    "бумага-02.png",
    "бумага 01.png",
    "открытое меню.png",
)


def same_visible_pixels(a: Image.Image, b: Image.Image) -> bool:
    if a.size != b.size:
        return False
    first, second = a.convert("RGBA"), b.convert("RGBA")
    if ImageChops.difference(first.getchannel("A"), second.getchannel("A")).getbbox():
        return False
    # Fully transparent pixels may legally have different hidden RGB colors.
    # Composite over both light/dark backdrops to compare every visible pixel.
    for color in ((0, 0, 0, 255), (255, 255, 255, 255)):
        background = Image.new("RGBA", first.size, color)
        lhs = Image.alpha_composite(background, first).convert("RGB")
        rhs = Image.alpha_composite(background, second).convert("RGB")
        if ImageChops.difference(lhs, rhs).getbbox():
            return False
    return True


def main() -> None:
    OUTPUT.mkdir(exist_ok=True)
    items: list[dict] = []
    for filename in ASSETS:
        source = ROOT / filename
        if not source.is_file():
            raise FileNotFoundError(f"Required source PNG missing: {source}")
        dest = OUTPUT / (source.stem + ".webp")
        with Image.open(source) as original:
            original.load()
            before_size = source.stat().st_size
            original_rgba = original.convert("RGBA")
            original_rgba.save(dest, format="WEBP", lossless=True, method=6, exact=True)
            with Image.open(dest) as decoded:
                decoded.load()
                if not same_visible_pixels(original_rgba, decoded):
                    dest.unlink(missing_ok=True)
                    raise ValueError(f"Pixel comparison failed: {filename}")
            after_size = dest.stat().st_size
            result = {
                "source": filename,
                "width": original.width,
                "height": original.height,
                "original_bytes": before_size,
                "candidate_bytes": after_size,
                "visually_lossless": True,
            }
            if after_size < before_size:
                result["output"] = dest.relative_to(ROOT).as_posix()
                result["saved_bytes"] = before_size - after_size
                result["saved_percent"] = round((before_size - after_size) / before_size * 100, 2)
                result["kept"] = True
            else:
                # Never add heavier assets just to change their file format.
                dest.unlink(missing_ok=True)
                result["output"] = None
                result["saved_bytes"] = 0
                result["saved_percent"] = 0
                result["kept"] = False
            items.append(result)
            print(f'{filename}: {before_size:,} -> {after_size:,} bytes '
                  f'({"kept" if result["kept"] else "not smaller"})')

    summary = {
        "format": "lossless WebP",
        "scope": "candidate assets only; original PNG and game code unchanged",
        "source_total_bytes": sum(item["original_bytes"] for item in items),
        "saved_total_bytes": sum(item["saved_bytes"] for item in items),
        "items": items,
    }
    (OUTPUT / "manifest.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print("Total bytes saved:", summary["saved_total_bytes"])


if __name__ == "__main__":
    main()
