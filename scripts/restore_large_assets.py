#!/usr/bin/env python3
"""Restore the exact original Azgaar paper texture from checked-in chunks.

A smaller palette PNG is present at the usual paths for immediate use.
The SHA-256-verified original can be restored offline by running this script.
"""
from pathlib import Path
import base64
import hashlib

ROOT = Path(__file__).resolve().parents[1]
PARTS = ROOT / "assets" / "originals"
NAME = "azgaar-soiled-paper-vertical.png.b64.part"
EXPECTED = "0b33f76defb984b16fbf2f14799a69d59433900e930c06cd59c57d00d203a6a5"
TARGETS = [
    ROOT / "web/vendor/azgaar/images/textures/soiled-paper-vertical.png",
    ROOT / "android/app/src/main/assets/vendor/azgaar/images/textures/soiled-paper-vertical.png",
]


def main():
    chunks = [PARTS / (NAME + f"{n:02d}") for n in range(7)]
    absent = [str(p) for p in chunks if not p.is_file()]
    if absent:
        raise SystemExit("Missing original asset chunks:\n" + "\n".join(absent))
    encoded = "".join(p.read_text(encoding="ascii").strip() for p in chunks)
    data = base64.b64decode(encoded, validate=True)
    digest = hashlib.sha256(data).hexdigest()
    if digest != EXPECTED:
        raise SystemExit(f"Checksum mismatch: {digest} != {EXPECTED}; files left unchanged")
    for target in TARGETS:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        print(f"Restored {target.relative_to(ROOT)} ({len(data):,} bytes)")
    print(f"Verified SHA-256: {digest}")


if __name__ == "__main__":
    main()
