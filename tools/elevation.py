"""Prepares the elevation data the image carries: Sonny's LiDAR Digital Terrain Model of Germany at
one arc second, built from the terrain models of the federal states, written in the grid format of
`backend/src/elevation/grid.py`.

The model is a terrain model: it gives the ground, without buildings and trees, which is where a
hose line lies. It is published under CC BY 4.0 at https://sonny.4lima.de as one zip per whole
degree, each holding an SRTM-style `.hgt` file, and can only be downloaded from Google Drive by a
signed-in user. The zips therefore go into `elevation/sonny/` by hand; their SHA-256 sums are
recorded in `elevation-sources.txt`, and a zip that does not match is refused.

The grid files are kept in the repository through Git LFS, so a build needs neither the zips nor
this script. Run it only when the source changes.

    python tools/elevation.py pin      record the checksums of the zips in elevation/sonny
    python tools/elevation.py build    check the zips and write the grid files into elevation/tiles

Needs numpy and rasterio; the server itself reads the result with the standard library alone.
"""

import argparse
import hashlib
import importlib
import os
import re
import shutil
import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend" / "src"))
grid = importlib.import_module("elevation.grid")

DATASET = "sonny-dtm-germany-1s-v3b"
SOURCES = Path(__file__).resolve().with_name("elevation-sources.txt")
ZIPS = ROOT / "elevation" / "sonny"
TILES = ROOT / "elevation" / "tiles"
TILE_NAME = re.compile(r"^N(\d{2})E(\d{3})$")
FIXED_TIME = 0


def checksum(file: Path) -> str:
    """Return a file's SHA-256 in hex."""
    digest = hashlib.sha256()
    with file.open("rb") as stream:
        while chunk := stream.read(1 << 20):
            digest.update(chunk)
    return digest.hexdigest()


def pinned() -> dict[str, str]:
    """Return the recorded checksum of every source zip, by tile name such as N52E013."""
    entries = {}
    for line in SOURCES.read_text().splitlines():
        if line.strip() and not line.startswith("#"):
            sum_, name = line.split()
            entries[name] = sum_
    return entries


def pin() -> None:
    """Record the checksums of the zips in elevation/sonny."""
    names = sorted(path.stem for path in ZIPS.glob("N*.zip") if TILE_NAME.match(path.stem))
    if not names:
        raise SystemExit(f"No tile zips in {ZIPS}")
    lines = [f"# {DATASET}: SHA-256 of every source zip, from https://sonny.4lima.de (CC BY 4.0)"]
    lines += [f"{checksum(ZIPS / f'{name}.zip')}  {name}" for name in names]
    SOURCES.write_text("\n".join(lines) + "\n")


def build_tile(name: str) -> str:
    """Write the grid file of one tile, stamped with a fixed time, and return a line saying what
    was written. A tile with voids is refused rather than written with holes."""
    import rasterio

    latitude, longitude = (int(part) for part in TILE_NAME.match(name).groups())
    with rasterio.open(f"/vsizip/{ZIPS / f'{name}.zip'}/{name}.hgt") as source:
        heights = source.read(1)
        transform = source.transform
        if source.nodata is not None and (heights == source.nodata).any():
            raise SystemExit(f"{name} has voids")
    geometry = grid.Geometry(
        rows=heights.shape[0],
        columns=heights.shape[1],
        north=transform.f + transform.e / 2,
        west=transform.c + transform.a / 2,
        latitude_step=-transform.e,
        longitude_step=transform.a,
    )
    target = TILES / grid.tile_name(latitude, longitude)
    grid.write(target, geometry, heights.astype("int16").tolist())
    os.utime(target, (FIXED_TIME, FIXED_TIME))
    return f"built {target.name}: {geometry.rows}×{geometry.columns}, {target.stat().st_size / 1e6:.1f} MB"


def build() -> None:
    """Check every pinned zip, then write one grid file per tile, a tile per processor at a time,
    and stamp the folder with a fixed time too, so unchanged data gives an unchanged image layer."""
    names = pinned()
    for name, expected in names.items():
        if not (ZIPS / f"{name}.zip").is_file():
            raise SystemExit(f"{name}.zip is missing in {ZIPS}")
        actual = checksum(ZIPS / f"{name}.zip")
        if actual != expected:
            raise SystemExit(f"{name}: checksum {actual} does not match {expected}")
    if TILES.exists():
        shutil.rmtree(TILES)
    TILES.mkdir(parents=True)
    with ProcessPoolExecutor() as pool:
        for line in pool.map(build_tile, sorted(names)):
            print(line, flush=True)
    (TILES / "VERSION").write_text(DATASET + "\n")
    for path in (TILES / "VERSION", TILES):
        os.utime(path, (FIXED_TIME, FIXED_TIME))
    total = sum(file.stat().st_size for file in TILES.iterdir())
    print(f"{len(names)} tiles, {total / 1e6:.0f} MB")


def main() -> None:
    """Run the command named on the command line."""
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("command", choices=["pin", "build"])
    {"pin": pin, "build": build}[parser.parse_args().command]()


if __name__ == "__main__":
    main()
