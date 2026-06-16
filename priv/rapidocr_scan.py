#!/usr/bin/env python3
"""RapidOCR wrapper for manavault — prints one line per detected text block."""

import contextlib
import os
import sys
import warnings

warnings.filterwarnings("ignore")

from rapidocr import RapidOCR
from rapidocr.utils.log import logger

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
            _ENGINE = RapidOCR()
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
        print("Usage: rapidocr_scan.py <image_path>", file=sys.stderr)
        sys.exit(1)

    image_path = sys.argv[1]
    engine = get_engine()

    try:
        with suppress_rapidocr_output():
            result = engine(image_path)
        for text in result_texts(result):
            print(text)
    except Exception as e:
        print(f"RapidOCR error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
