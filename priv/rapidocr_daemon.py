#!/usr/bin/env python3
"""Persistent RapidOCR daemon for manavault.

Reads image paths from stdin (one per line), writes OCR results to stdout
as JSON arrays, and flushes after each result. Loads the OCR engine once on startup.
"""

import contextlib
import json
import os
import sys
import tempfile
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")

from PIL import Image, ImageOps
from rapidocr import RapidOCR
from rapidocr.utils.log import logger

logger.disabled = True

CARD_ASPECT_RATIO = 2.5 / 3.5


@contextlib.contextmanager
def suppress_rapidocr_output():
    with open(os.devnull, "w") as devnull:
        with contextlib.redirect_stdout(devnull), contextlib.redirect_stderr(devnull):
            yield


def result_texts(result):
    texts = getattr(result, "txts", None)
    if texts is not None:
        return list(texts)

    if isinstance(result, tuple) and len(result) > 0:
        rows = result[0] or []
        return [row[1] for row in rows if len(row) >= 2]

    return []


def command_from_line(line):
    try:
        command = json.loads(line)
    except json.JSONDecodeError:
        return {"path": line, "crop": "full"}

    if isinstance(command, dict):
        return command

    return {"path": line, "crop": "full"}


def estimated_card_box(width, height):
    aspect = width / height

    if abs(aspect - CARD_ASPECT_RATIO) < 0.08:
        return (0, 0, width, height)

    max_width = width * 0.9
    max_height = height * 0.9
    card_height = max_height
    card_width = card_height * CARD_ASPECT_RATIO

    if card_width > max_width:
        card_width = max_width
        card_height = card_width / CARD_ASPECT_RATIO

    left = (width - card_width) / 2
    top = (height - card_height) / 2
    return (left, top, left + card_width, top + card_height)


def title_crop(image_path):
    image = Image.open(image_path)
    image = ImageOps.exif_transpose(image).convert("RGB")
    width, height = image.size
    card_left, card_top, card_right, card_bottom = estimated_card_box(width, height)
    card_width = card_right - card_left
    card_height = card_bottom - card_top

    left = int(card_left + card_width * 0.055)
    top = int(card_top + card_height * 0.045)
    right = int(card_left + card_width * 0.945)
    bottom = int(card_top + card_height * 0.17)

    crop = image.crop((left, top, right, bottom))

    if crop.width < 900:
        scale = 900 / crop.width
        crop = crop.resize((900, max(1, int(crop.height * scale))), Image.Resampling.LANCZOS)

    return crop


@contextlib.contextmanager
def ocr_input_path(image_path, crop):
    if crop != "title":
        yield image_path
        return

    temp_path = None

    try:
        image = title_crop(image_path)

        with tempfile.NamedTemporaryFile(suffix=Path(image_path).suffix or ".jpg", delete=False) as temp:
            temp_path = temp.name
            image.save(temp, format="JPEG", quality=92)

        yield temp_path
    finally:
        if temp_path:
            with contextlib.suppress(OSError):
                os.unlink(temp_path)


def main():
    with suppress_rapidocr_output():
        engine = RapidOCR()

    # Signal readiness to the Elixir side.
    print("READY", flush=True)

    for line in sys.stdin:
        command = command_from_line(line.strip())
        image_path = command.get("path")
        crop = command.get("crop", "full")

        if not image_path:
            continue

        try:
            with suppress_rapidocr_output():
                with ocr_input_path(image_path, crop) as input_path:
                    result = engine(input_path)
            print(json.dumps(result_texts(result)), flush=True)
        except Exception as e:
            print(json.dumps({"error": str(e)}), flush=True)


if __name__ == "__main__":
    main()
