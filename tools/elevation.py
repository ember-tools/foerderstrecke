"""Prepares the elevation data the image carries: the Copernicus DEM GLO-30 tiles covering the box
around Germany, cropped to the box, rounded to whole metres and written in the grid format of
`backend/src/elevation/grid.py`.

The source tiles are named with their SHA-256 in `elevation-sources.txt`; a download that does not
match is refused. Tiles the dataset does not have lie entirely on the sea, where the dataset's own
documentation says to assume a height of 0 m.

    python tools/elevation.py fetch    download the source tiles into elevation/download
    python tools/elevation.py build    write the grid files into elevation/tiles
    python tools/elevation.py pin      record the checksums of the downloaded tiles (maintenance)

Needs numpy and rasterio; the server itself reads the result with the standard library alone.
"""

import argparse
import hashlib
import importlib
import math
import os
import shutil
import sys
import urllib.error
import urllib.request
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend" / "src"))
grid = importlib.import_module("elevation.grid")

DATASET = "copernicus-dem-glo30-2022"
SOURCE = "https://copernicus-dem-30m.s3.amazonaws.com/{name}/{name}.tif"
SOURCES = Path(__file__).resolve().with_name("elevation-sources.txt")
DOWNLOAD = ROOT / "elevation" / "download"
TILES = ROOT / "elevation" / "tiles"
FIXED_TIME = 0


def source_name(latitude: int, longitude: int) -> str:
    """Return the dataset's name of the tile with the given south-west corner."""
    return f"Copernicus_DSM_COG_10_N{latitude:02d}_00_E{longitude:03d}_00_DEM"


def corners() -> list[tuple[int, int]]:
    """Return the south-west corners of every whole-degree tile touching the box."""
    west, south, east, north = grid.COVERAGE
    return [(latitude, longitude)
            for latitude in range(math.floor(south), math.ceil(north))
            for longitude in range(math.floor(west), math.ceil(east))]


def pinned() -> dict[str, str]:
    """Return the recorded checksum of every tile the dataset has, by source name."""
    entries = {}
    for line in SOURCES.read_text().splitlines():
        if line.strip() and not line.startswith("#"):
            checksum, name = line.split()
            entries[name] = checksum
    return entries


def checksum(file: Path) -> str:
    """Return a file's SHA-256 in hex."""
    digest = hashlib.sha256()
    with file.open("rb") as stream:
        while chunk := stream.read(1 << 20):
            digest.update(chunk)
    return digest.hexdigest()


def fetch() -> None:
    """Download every pinned tile not yet present, checking each against its checksum."""
    DOWNLOAD.mkdir(parents=True, exist_ok=True)
    for name, expected in pinned().items():
        target = DOWNLOAD / f"{name}.tif"
        if target.is_file() and checksum(target) == expected:
            continue
        partial = target.with_suffix(".part")
        with urllib.request.urlopen(SOURCE.format(name=name), timeout=120) as response, partial.open("wb") as out:
            shutil.copyfileobj(response, out)
        actual = checksum(partial)
        if actual != expected:
            partial.unlink()
            raise SystemExit(f"{name}: checksum {actual} does not match {expected}")
        partial.replace(target)
        print(f"fetched {name}")


def pin() -> None:
    """Ask the dataset which tiles exist, download them and record their checksums."""
    DOWNLOAD.mkdir(parents=True, exist_ok=True)
    lines = [f"# {DATASET}: SHA-256 of every source tile touching the box {grid.COVERAGE}"]
    for latitude, longitude in corners():
        name = source_name(latitude, longitude)
        target = DOWNLOAD / f"{name}.tif"
        if not target.is_file():
            partial = target.with_suffix(".part")
            try:
                with urllib.request.urlopen(SOURCE.format(name=name), timeout=120) as response, \
                        partial.open("wb") as out:
                    shutil.copyfileobj(response, out)
            except urllib.error.HTTPError as error:
                partial.unlink(missing_ok=True)
                if error.code in (403, 404):
                    continue
                raise
            partial.replace(target)
        lines.append(f"{checksum(target)}  {name}")
    SOURCES.write_text("\n".join(lines) + "\n")


def build_tile(latitude: int, longitude: int) -> str:
    """Write the grid file of one source tile, cropped to the box and stamped with a fixed time,
    and return a line saying what was written."""
    import numpy
    import rasterio
    from rasterio.windows import Window

    west, south, east, north = grid.COVERAGE
    with rasterio.open(DOWNLOAD / f"{source_name(latitude, longitude)}.tif") as source:
        transform = source.transform
        column_step, row_step = transform.a, -transform.e
        first_column = max(0, math.floor((west - transform.c) / column_step))
        last_column = min(source.width, math.ceil((east - transform.c) / column_step))
        first_row = max(0, math.floor((transform.f - north) / row_step))
        last_row = min(source.height, math.ceil((transform.f - south) / row_step))
        window = Window(first_column, first_row, last_column - first_column, last_row - first_row)
        heights = numpy.rint(source.read(1, window=window)).astype(numpy.int16)
    geometry = grid.Geometry(
        rows=heights.shape[0],
        columns=heights.shape[1],
        north=transform.f - (first_row + 0.5) * row_step,
        west=transform.c + (first_column + 0.5) * column_step,
        latitude_step=row_step,
        longitude_step=column_step,
    )
    target = TILES / grid.tile_name(latitude, longitude)
    grid.write(target, geometry, heights.tolist())
    os.utime(target, (FIXED_TIME, FIXED_TIME))
    return f"built {target.name}: {geometry.rows}×{geometry.columns}, {target.stat().st_size / 1e6:.1f} MB"


def build() -> None:
    """Write one grid file per pinned tile, a tile per processor at a time, and stamp the folder
    with a fixed time too, so an unchanged result gives an unchanged image layer."""
    if TILES.exists():
        shutil.rmtree(TILES)
    TILES.mkdir(parents=True)
    names = pinned()
    present = [corner for corner in corners() if source_name(*corner) in names]
    with ProcessPoolExecutor() as pool:
        for line in pool.map(build_tile, *zip(*present)):
            print(line, flush=True)
    (TILES / "VERSION").write_text(DATASET + "\n")
    for path in (TILES / "VERSION", TILES):
        os.utime(path, (FIXED_TIME, FIXED_TIME))
    total = sum(file.stat().st_size for file in TILES.iterdir())
    print(f"{len(names)} tiles, {total / 1e6:.0f} MB")


def main() -> None:
    """Run the command named on the command line."""
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("command", choices=["fetch", "build", "pin"])
    {"fetch": fetch, "build": build, "pin": pin}[parser.parse_args().command]()


if __name__ == "__main__":
    main()
