#!/usr/bin/env python3
"""Persistent RapidOCR daemon for manavault.

Reads image paths from stdin (one per line), writes OCR results to stdout
as JSON arrays, and flushes after each result. Loads the OCR engine once on startup.
"""

import contextlib
import json
import os
import sys
import warnings

warnings.filterwarnings("ignore")

from rapidocr import RapidOCR
from rapidocr.utils.log import logger

logger.disabled = True


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


def main():
    with suppress_rapidocr_output():
        engine = RapidOCR()

    # Signal readiness to the Elixir side.
    print("READY", flush=True)

    for line in sys.stdin:
        image_path = line.strip()
        if not image_path:
            continue

        try:
            with suppress_rapidocr_output():
                result = engine(image_path)
            print(json.dumps(result_texts(result)), flush=True)
        except Exception as e:
            print(json.dumps({"error": str(e)}), flush=True)


if __name__ == "__main__":
    main()
