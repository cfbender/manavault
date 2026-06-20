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
from rapidocr.utils.typings import EngineType

logger.disabled = True

CARD_ASPECT_RATIO = 2.5 / 3.5
ENGINE_ENV = "MANAVAULT_OCR_ENGINE"


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


def parse_int_env(name):
    value = os.environ.get(name)
    if value is None or value == "":
        return None

    try:
        return int(value)
    except ValueError:
        return None


def parse_bool_env(name):
    value = os.environ.get(name)
    if value is None or value == "":
        return None

    return value.lower() in ("1", "true", "yes", "on")


def rapidocr_params():
    engine_name = os.environ.get(ENGINE_ENV, "onnxruntime").lower()

    if engine_name not in ("onnxruntime", "openvino"):
        raise ValueError(f"{ENGINE_ENV} must be onnxruntime or openvino")

    engine_type = EngineType(engine_name)
    params = {
        "Det.engine_type": engine_type,
        "Cls.engine_type": engine_type,
        "Rec.engine_type": engine_type,
    }

    threads = parse_int_env("MANAVAULT_OCR_THREADS")

    if engine_name == "openvino":
        add_openvino_params(params, threads)
    else:
        add_onnxruntime_params(params, threads)

    return params


def add_openvino_params(params, threads):
    if threads is not None:
        params["EngineConfig.openvino.inference_num_threads"] = threads

    int_envs = {
        "MANAVAULT_OCR_OPENVINO_NUM_STREAMS": "EngineConfig.openvino.num_streams",
        "MANAVAULT_OCR_OPENVINO_NUM_REQUESTS": "EngineConfig.openvino.performance_num_requests",
    }

    for env_name, param_name in int_envs.items():
        value = parse_int_env(env_name)
        if value is not None:
            params[param_name] = value

    string_envs = {
        "MANAVAULT_OCR_OPENVINO_PERFORMANCE_HINT": "EngineConfig.openvino.performance_hint",
        "MANAVAULT_OCR_OPENVINO_SCHEDULING_CORE_TYPE": "EngineConfig.openvino.scheduling_core_type",
    }

    for env_name, param_name in string_envs.items():
        value = os.environ.get(env_name)
        if value:
            params[param_name] = value

    bool_envs = {
        "MANAVAULT_OCR_OPENVINO_CPU_PINNING": "EngineConfig.openvino.enable_cpu_pinning",
        "MANAVAULT_OCR_OPENVINO_HYPER_THREADING": "EngineConfig.openvino.enable_hyper_threading",
    }

    for env_name, param_name in bool_envs.items():
        value = parse_bool_env(env_name)
        if value is not None:
            params[param_name] = value


def add_onnxruntime_params(params, threads):
    intra_threads = parse_int_env("MANAVAULT_OCR_ONNX_INTRA_OP_THREADS")
    inter_threads = parse_int_env("MANAVAULT_OCR_ONNX_INTER_OP_THREADS")

    if threads is not None and intra_threads is None:
        intra_threads = threads

    if intra_threads is not None:
        params["EngineConfig.onnxruntime.intra_op_num_threads"] = intra_threads

    if inter_threads is not None:
        params["EngineConfig.onnxruntime.inter_op_num_threads"] = inter_threads


def build_engine():
    return RapidOCR(params=rapidocr_params())


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

    footer_left = int(card_left + card_width * 0.055)
    footer_top = int(card_top + card_height * 0.88)
    footer_right = int(card_left + card_width * 0.945)
    footer_bottom = int(card_top + card_height * 0.965)

    title = image.crop((left, top, right, bottom))
    footer = image.crop((footer_left, footer_top, footer_right, footer_bottom))
    target_width = parse_int_env("MANAVAULT_OCR_TITLE_WIDTH") or 640
    if target_width <= 0:
        target_width = max(title.width, footer.width)

    title = resize_to_width(title, target_width)
    footer = resize_to_width(footer, target_width)

    gap = max(8, int(target_width * 0.02))
    crop = Image.new("RGB", (target_width, title.height + footer.height + gap), "white")
    crop.paste(title, (0, 0))
    crop.paste(footer, (0, title.height + gap))

    return crop


def resize_to_width(image, target_width):
    if target_width <= 0 or image.width == target_width:
        return image

    scale = target_width / image.width
    return image.resize(
        (target_width, max(1, int(image.height * scale))), Image.Resampling.LANCZOS
    )


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
        engine = build_engine()

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
                    result = engine(input_path, use_det=True, use_cls=True, use_rec=True)
            print(json.dumps(result_texts(result)), flush=True)
        except Exception as e:
            print(json.dumps({"error": str(e)}), flush=True)


if __name__ == "__main__":
    main()
