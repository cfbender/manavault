#!/usr/bin/env python3
"""RapidOCR wrapper for manavault — prints one line per detected text block."""

import contextlib
import os
import sys
import warnings

warnings.filterwarnings("ignore")

from rapidocr.utils.log import logger
from rapidocr_daemon import build_engine, ocr_input_path

logger.disabled = True

_ENGINE = None


@contextlib.contextmanager
def suppress_rapidocr_output():
    with open(os.devnull, "w") as devnull:
        with contextlib.redirect_stdout(devnull), contextlib.redirect_stderr(devnull):
            yield


def get_engine():
    global _ENGINE
    if _ENGINE is None:
        with suppress_rapidocr_output():
            _ENGINE = build_engine()
    return _ENGINE


def result_texts(result):
    texts = getattr(result, "txts", None)
    if texts is not None:
        return list(texts)

    if isinstance(result, tuple) and len(result) > 0:
        rows = result[0] or []
        return [row[1] for row in rows if len(row) >= 2]

    return []


def main():
    if len(sys.argv) < 2:
        print("Usage: rapidocr_scan.py <image_path> [full|title]", file=sys.stderr)
        sys.exit(1)

    image_path = sys.argv[1]
    crop = sys.argv[2] if len(sys.argv) > 2 else "full"
    engine = get_engine()

    try:
        with suppress_rapidocr_output():
            with ocr_input_path(image_path, crop) as input_path:
                result = engine(input_path, use_det=True, use_cls=True, use_rec=True)
        for text in result_texts(result):
            print(text)
    except Exception as e:
        print(f"RapidOCR error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
