#!/usr/bin/env python3
"""Creates deterministic phone-camera-like scanner benchmark captures."""

import hashlib
import random
import sys
from pathlib import Path

from PIL import Image, ImageEnhance, ImageFilter, ImageOps

CARD_ASPECT_RATIO = 2.5 / 3.5
OUTPUT_SIZE = (720, 1008)


def make_capture(input_path, output_path, seed):
    rng = random.Random(seed)
    card = ImageOps.exif_transpose(Image.open(input_path)).convert("RGB")
    frame = Image.new("RGB", OUTPUT_SIZE, (34, 35, 38))
    max_width = OUTPUT_SIZE[0] * rng.uniform(0.94, 0.99)
    max_height = OUTPUT_SIZE[1] * rng.uniform(0.94, 1.0)
    card_width = max_width
    card_height = card_width / CARD_ASPECT_RATIO

    if card_height > max_height:
        card_height = max_height
        card_width = card_height * CARD_ASPECT_RATIO

    card = card.resize((int(card_width), int(card_height)), Image.Resampling.LANCZOS)
    x = (OUTPUT_SIZE[0] - card.width) // 2 + rng.randint(-12, 12)
    y = (OUTPUT_SIZE[1] - card.height) // 2 + rng.randint(-12, 12)
    frame.paste(card, (x, y))
    frame = ImageEnhance.Brightness(frame).enhance(rng.uniform(0.84, 1.14))
    frame = ImageEnhance.Contrast(frame).enhance(rng.uniform(0.90, 1.10))

    if rng.random() < 0.30:
        frame = frame.filter(ImageFilter.GaussianBlur(rng.uniform(0.20, 0.45)))

    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    frame.save(output_path, format="JPEG", quality=68, optimize=True)


def seed_for(value):
    return int(hashlib.sha256(value.encode("utf-8")).hexdigest()[:16], 16)


def main():
    if len(sys.argv) != 4:
        print("Usage: scanner_camera_fixture.py <input> <output> <seed>", file=sys.stderr)
        return 2

    make_capture(sys.argv[1], sys.argv[2], seed_for(sys.argv[3]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
