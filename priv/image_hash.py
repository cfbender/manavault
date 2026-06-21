#!/usr/bin/env python3
import json
import sys
import warnings

from PIL import Image, ImageFilter, ImageOps, ImageStat

warnings.filterwarnings("ignore", category=DeprecationWarning)

CARD_ASPECT_RATIO = 2.5 / 3.5


def card_box(image):
    width, height = image.size
    dark_box = dark_card_box(image)

    if full_frame_card(image, width, height):
        if dark_box is None:
            return (0, 0, width, height)

        dark_area = (dark_box[2] - dark_box[0]) * (dark_box[3] - dark_box[1])

        if dark_area < width * height * 0.20:
            return (0, 0, width, height)

        return dark_box

    if dark_box is not None:
        dark_area = (dark_box[2] - dark_box[0]) * (dark_box[3] - dark_box[1])

        if dark_area < width * height * 0.72:
            return dark_box

        return dark_box

    return edge_card_box(image)


def full_frame_card(image, width, height):
    if not is_card_aspect(width, height, 0.04):
        return False

    strip = max(2, int(min(width, height) * 0.04))
    edge_boxes = [
        (0, 0, width, strip),
        (0, height - strip, width, height),
        (0, 0, strip, height),
        (width - strip, 0, width, height),
    ]

    edge_stddev = sum(
        ImageStat.Stat(image.crop(box)).stddev[0] for box in edge_boxes
    ) / len(edge_boxes)

    return edge_stddev <= 34


def dark_card_box(image):
    width, height = image.size
    scale = min(1.0, 240 / max(width, height))
    small = image

    if scale < 1.0:
        small = image.resize(
            (max(1, int(width * scale)), max(1, int(height * scale))),
            Image.Resampling.BILINEAR,
        )

    small = ImageOps.autocontrast(small.filter(ImageFilter.MedianFilter(size=3)))
    stats = ImageStat.Stat(small)
    threshold = min(110, max(35, stats.mean[0] - stats.stddev[0] * 0.15))
    pixels = small.load()
    image_area = width * height
    small_area = small.width * small.height
    visited = bytearray(small_area)
    candidates = []

    for y in range(small.height):
        for x in range(small.width):
            index = y * small.width + x

            if visited[index] or pixels[x, y] > threshold:
                continue

            left, top, right, bottom, count = dark_component_box(pixels, visited, small.width, small.height, x, y, threshold)

            if count < small_area * 0.012:
                continue

            fitted = fit_card_aspect(
                left / scale,
                top / scale,
                (right + 1) / scale,
                (bottom + 1) / scale,
                width,
                height,
            )

            if plausible_card_box(fitted, width, height):
                box_width = fitted[2] - fitted[0]
                box_height = fitted[3] - fitted[1]
                area_ratio = (box_width * box_height) / image_area
                aspect_score = 1 - min(1, abs((box_width / box_height) - CARD_ASPECT_RATIO) / 0.18)
                fill_score = min(1, count / (small_area * 0.18))
                area_score = min(1, area_ratio / 0.45)
                candidates.append((aspect_score * 3 + fill_score + area_score, fitted))

    if not candidates:
        return None

    return max(candidates, key=lambda candidate: candidate[0])[1]


def dark_component_box(pixels, visited, width, height, start_x, start_y, threshold):
    stack = [(start_x, start_y)]
    left = right = start_x
    top = bottom = start_y
    count = 0

    while stack:
        x, y = stack.pop()

        if x < 0 or y < 0 or x >= width or y >= height:
            continue

        index = y * width + x

        if visited[index] or pixels[x, y] > threshold:
            continue

        visited[index] = 1
        count += 1
        left = min(left, x)
        top = min(top, y)
        right = max(right, x)
        bottom = max(bottom, y)

        for next_y in range(y - 1, y + 2):
            for next_x in range(x - 1, x + 2):
                if next_x != x or next_y != y:
                    stack.append((next_x, next_y))

    return left, top, right, bottom, count


def edge_card_box(image):
    width, height = image.size
    scale = min(1.0, 320 / max(width, height))
    small = image

    if scale < 1.0:
        small = image.resize(
            (max(1, int(width * scale)), max(1, int(height * scale))),
            Image.Resampling.BILINEAR,
        )

    edges = small.filter(ImageFilter.FIND_EDGES)
    stats = ImageStat.Stat(edges)
    threshold = max(18, stats.mean[0] + stats.stddev[0] * 0.6)
    pixels = edges.load()
    xs = []
    ys = []

    for y in range(edges.height):
        for x in range(edges.width):
            if pixels[x, y] >= threshold:
                xs.append(x)
                ys.append(y)

    if not xs:
        return (0, 0, width, height)

    left = min(xs) / scale
    top = min(ys) / scale
    right = (max(xs) + 1) / scale
    bottom = (max(ys) + 1) / scale
    pad = max(width, height) * 0.015
    left = max(0, left - pad)
    top = max(0, top - pad)
    right = min(width, right + pad)
    bottom = min(height, bottom + pad)

    box_area = (right - left) * (bottom - top)
    image_area = width * height

    if box_area < image_area * 0.20:
        return (0, 0, width, height)

    if is_card_aspect(width, height, 0.04) and box_area > image_area * 0.88:
        return (0, 0, width, height)

    return fit_card_aspect(left, top, right, bottom, width, height)


def is_card_aspect(width, height, tolerance):
    return height > 0 and abs(width / height - CARD_ASPECT_RATIO) < tolerance


def plausible_card_box(box, width, height):
    left, top, right, bottom = box
    box_width = right - left
    box_height = bottom - top

    if box_width <= 0 or box_height <= 0:
        return False

    area_ratio = (box_width * box_height) / (width * height)
    aspect = box_width / box_height
    return 0.08 <= area_ratio <= 0.95 and abs(aspect - CARD_ASPECT_RATIO) < 0.16


def fit_card_aspect(left, top, right, bottom, width, height):
    box_width = right - left
    box_height = bottom - top
    center_x = (left + right) / 2
    center_y = (top + bottom) / 2

    if box_width / box_height > CARD_ASPECT_RATIO:
        box_height = box_width / CARD_ASPECT_RATIO
    else:
        box_width = box_height * CARD_ASPECT_RATIO

    left = max(0, center_x - box_width / 2)
    right = min(width, center_x + box_width / 2)
    top = max(0, center_y - box_height / 2)
    bottom = min(height, center_y + box_height / 2)
    box_width = right - left
    box_height = bottom - top

    if box_width / box_height > CARD_ASPECT_RATIO:
        box_width = box_height * CARD_ASPECT_RATIO
        left = max(0, min(width - box_width, center_x - box_width / 2))
        right = left + box_width
    else:
        box_height = box_width / CARD_ASPECT_RATIO
        top = max(0, min(height - box_height, center_y - box_height / 2))
        bottom = top + box_height

    return (int(left), int(top), int(right), int(bottom))


def refine_card_box_for_content(image, box):
    left, top, right, bottom = box
    card_width = right - left
    card_height = bottom - top

    if card_width <= 0 or card_height <= 0:
        return box

    scan_left = int(left + card_width * 0.05)
    scan_right = int(right - card_width * 0.05)
    scan_top = max(0, int(top))
    scan_bottom = min(image.height, int(top + card_height * 0.28))

    if scan_right <= scan_left or scan_bottom <= scan_top:
        return box

    crop = image.crop((scan_left, scan_top, scan_right, scan_bottom)).convert("L")
    threshold = content_dark_threshold(crop)
    pixels = crop.load()

    for y in range(crop.height):
        dark_pixels = 0

        for x in range(crop.width):
            if pixels[x, y] <= threshold:
                dark_pixels += 1

        if dark_pixels / crop.width >= 0.22:
            refined_top = scan_top + y

            if bottom - refined_top > card_height * 0.55:
                return (left, refined_top, right, bottom)

            return box

    return box


def content_dark_threshold(crop):
    stats = ImageStat.Stat(crop)
    return min(95, max(35, stats.mean[0] - stats.stddev[0] * 0.5))


def art_crop(image):
    card_left, card_top, card_right, card_bottom = refine_card_box_for_content(
        image, card_box(image)
    )
    card_width = card_right - card_left
    card_height = card_bottom - card_top

    left = int(card_left + card_width * 0.08)
    top = int(card_top + card_height * 0.16)
    right = int(card_left + card_width * 0.92)
    bottom = int(card_top + card_height * 0.48)

    if right <= left or bottom <= top:
        return image

    return image.crop((left, top, right, bottom))


def dhash(path, crop_mode):
    image = ImageOps.exif_transpose(Image.open(path)).convert("L")

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
