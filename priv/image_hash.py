#!/usr/bin/env python3
import json
import sys
import warnings

from PIL import Image

warnings.filterwarnings("ignore", category=DeprecationWarning)


def art_crop(image):
    width, height = image.size

    # Approximate the normal Magic card art box. Keeping this deterministic is
    # more useful than trying to detect borders in every capture.
    left = int(width * 0.08)
    top = int(height * 0.16)
    right = int(width * 0.92)
    bottom = int(height * 0.48)

    if right <= left or bottom <= top:
        return image

    return image.crop((left, top, right, bottom))


def dhash(path, crop_mode):
    image = Image.open(path).convert("L")

    if crop_mode == "art":
        image = art_crop(image)

    image = image.resize((9, 8), Image.Resampling.LANCZOS)
    pixels = list(image.getdata())
    bits = []

    for row in range(8):
        offset = row * 9

        for column in range(8):
            bits.append(1 if pixels[offset + column] > pixels[offset + column + 1] else 0)

    value = 0

    for bit in bits:
        value = (value << 1) | bit

    return f"{value:016x}"


def main():
    if len(sys.argv) < 3:
        print("Usage: image_hash.py <full|art> <image_path> [image_path...]", file=sys.stderr)
        return 2

    crop_mode = sys.argv[1]

    if crop_mode not in ("full", "art"):
        print("Crop mode must be full or art", file=sys.stderr)
        return 2

    results = {}

    for path in sys.argv[2:]:
        try:
            results[path] = {"ok": True, "hash": dhash(path, crop_mode)}
        except Exception as exc:
            results[path] = {"ok": False, "error": str(exc)}

    print(json.dumps(results))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
