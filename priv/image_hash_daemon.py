#!/usr/bin/env python3
"""Persistent perceptual image hashing daemon for ManaVault scanner matching."""

import json
import sys
import warnings

from image_hash import dhash

warnings.filterwarnings("ignore", category=DeprecationWarning)


def command_from_line(line):
    try:
        command = json.loads(line)
    except json.JSONDecodeError:
        return {"paths": [line], "crop": "art"}

    if isinstance(command, str):
        return {"paths": [command], "crop": "art"}

    if not isinstance(command, dict):
        return {"paths": [], "crop": "art"}

    path = command.get("path")
    paths = command.get("paths")

    if isinstance(paths, list):
        normalized_paths = [value for value in paths if isinstance(value, str)]
    elif isinstance(path, str):
        normalized_paths = [path]
    else:
        normalized_paths = []

    crop = command.get("crop") or "art"
    if crop not in ("full", "art"):
        crop = "art"

    return {"paths": normalized_paths, "crop": crop}


def hash_paths(paths, crop):
    results = {}

    for path in paths:
        try:
            results[path] = {"ok": True, "hash": dhash(path, crop)}
        except Exception as exc:
            results[path] = {"ok": False, "error": str(exc)}

    return results


def main():
    print("READY", flush=True)

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        command = command_from_line(line)
        print(json.dumps(hash_paths(command["paths"], command["crop"])), flush=True)


if __name__ == "__main__":
    main()
