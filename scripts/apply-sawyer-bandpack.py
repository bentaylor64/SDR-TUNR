#!/usr/bin/env python3
"""Overlay the reviewed browser files on an extracted 1.14.0 local package."""
import argparse
import hashlib
from pathlib import Path
from shutil import copy2

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("package", type=Path, help="path to the extracted SDR-TUNR-Web directory")
args = parser.parse_args()
source = Path(__file__).resolve().parents[1] / "dist"
target = args.package.resolve() / "web" / "public"
app = target / "app.js"
original = "21a55b6f12ca2c77c7094375e4a9c7e2cba9e587750bbeb25241bc0821f2df3a"
if not app.is_file() or not (target / "index.html").is_file() or not (target / "scanner.js").is_file():
    parser.error("not an extracted SDR-TUNR-Web browser package")
if 'data-runtime="hosted"' in (target / "index.html").read_text(encoding="utf-8"):
    parser.error("target is a hosted demo, not the local receiver")
patched = hashlib.sha256((source / "app.js").read_bytes()).hexdigest()
if hashlib.sha256(app.read_bytes()).hexdigest() not in {original, patched}:
    parser.error("unsupported or modified app.js; use a fresh 1.14.0 extraction")
pack = "sawyer-bandpack.js"
if (target / pack).exists() and (target / pack).read_bytes() != (source / pack).read_bytes():
    parser.error("target already has a different Sawyer BandPack; use a fresh extraction")
for name in (pack, "app.js"):
    copy2(source / name, target / name)
print("Sawyer BandPack added to the extracted local package; original ZIP unchanged.")
