"""The elevation grid format: one file per whole degree of latitude and longitude, holding whole
metres as 16-bit integers in compressed square blocks.

A file starts with a fixed header, then the byte offsets of all blocks, then the blocks. Each block
holds up to `BLOCK` × `BLOCK` samples (fewer at the right and bottom edge of a file). A sample is
stored as its difference to the prediction left + above − above-left (left alone in a block's first
row, above alone in its first column), and the block's differences are compressed with LZMA. On
terrain that prediction is close, so the differences compress far better than the heights.

Both directions need nothing beyond the standard library, so the server image carries no raster
library and the tests need no data files.
"""

import itertools
import lzma
import math
import operator
import os
import struct
from array import array
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path

MAGIC = b"FSDEM\x00\x02\x00"
HEADER = struct.Struct("<8sIIIdddd")
BLOCK = 256
COVERAGE = (5.8, 47.2, 15.1, 55.1)
"""The box the data covers as west, south, east, north: the same box the map tiles cover."""


@dataclass(frozen=True)
class Geometry:
    """Where a file's samples lie: the centre of the top-left sample and the spacing, in degrees."""

    rows: int
    columns: int
    north: float
    west: float
    latitude_step: float
    longitude_step: float


class GridError(Exception):
    """A file that is not in this version of the grid format."""


def tile_name(latitude: int, longitude: int) -> str:
    """Return the file name of the whole-degree tile with the given south-west corner."""
    north_south = "N" if latitude >= 0 else "S"
    east_west = "E" if longitude >= 0 else "W"
    return f"{north_south}{abs(latitude):02d}{east_west}{abs(longitude):03d}.dem"


def encode(rows: Sequence[Sequence[int]]) -> bytes:
    """Encode one block given as its rows of heights."""
    residuals = array("h")
    previous: Sequence[int] | None = None
    for row in rows:
        change = row if previous is None else list(map(operator.sub, row, previous))
        residuals.append(change[0])
        residuals.extend(map(operator.sub, change[1:], change[:-1]))
        previous = row
    return lzma.compress(residuals.tobytes(), preset=6)


def decode(data: bytes, width: int) -> array:
    """Decode one block of the given row width into its heights, row by row."""
    residuals = array("h")
    residuals.frombytes(lzma.decompress(data))
    heights = array("h")
    previous: array | None = None
    for left in range(0, len(residuals), width):
        change = itertools.accumulate(residuals[left:left + width])
        row = array("h", change if previous is None else map(operator.add, previous, change))
        heights.extend(row)
        previous = row
    return heights


def write(file: Path, geometry: Geometry, heights: Sequence[Sequence[int]]) -> None:
    """Write heights in whole metres, given as `geometry.rows` rows of `geometry.columns`."""
    blocks = [
        encode([row[left:left + BLOCK] for row in heights[top:top + BLOCK]])
        for top in range(0, geometry.rows, BLOCK)
        for left in range(0, geometry.columns, BLOCK)
    ]
    header = HEADER.pack(MAGIC, geometry.rows, geometry.columns, BLOCK, geometry.north, geometry.west,
                         geometry.latitude_step, geometry.longitude_step)
    first = HEADER.size + 8 * (len(blocks) + 1)
    offsets = list(itertools.accumulate((len(block) for block in blocks), initial=first))
    with file.open("wb") as out:
        out.write(header)
        out.write(struct.pack(f"<{len(offsets)}Q", *offsets))
        for block in blocks:
            out.write(block)


class GridFile:
    """One grid file opened for reading. Blocks are decoded on request; keeping them is up to the
    caller."""

    def __init__(self, file: Path) -> None:
        """Open a file and read its header and block offsets."""
        self._descriptor = os.open(file, os.O_RDONLY)
        try:
            header = os.pread(self._descriptor, HEADER.size, 0)
            if len(header) != HEADER.size:
                raise GridError(f"{file.name} is too short for a grid file")
            magic, rows, columns, block, north, west, latitude_step, longitude_step = HEADER.unpack(header)
            if magic != MAGIC or block != BLOCK:
                raise GridError(f"{file.name} is not a grid file of this version")
            self.geometry = Geometry(rows, columns, north, west, latitude_step, longitude_step)
            self.blocks_across = math.ceil(columns / BLOCK)
            count = self.blocks_across * math.ceil(rows / BLOCK)
            table = os.pread(self._descriptor, 8 * (count + 1), HEADER.size)
            if len(table) != 8 * (count + 1):
                raise GridError(f"{file.name} ends inside its block offsets")
            self._offsets = struct.unpack(f"<{count + 1}Q", table)
        except BaseException:
            os.close(self._descriptor)
            raise

    def block(self, index: int) -> array:
        """Decode one block into its heights, row by row."""
        start, end = self._offsets[index], self._offsets[index + 1]
        return decode(os.pread(self._descriptor, end - start, start), self.block_width(index))

    def block_width(self, index: int) -> int:
        """Return how many samples a row of the given block holds."""
        left = (index % self.blocks_across) * BLOCK
        return min(BLOCK, self.geometry.columns - left)

    def locate(self, row: int, column: int) -> tuple[int, int]:
        """Return the block holding a sample and the sample's place inside it."""
        index = (row // BLOCK) * self.blocks_across + column // BLOCK
        return index, (row % BLOCK) * self.block_width(index) + column % BLOCK

    def close(self) -> None:
        """Close the file."""
        os.close(self._descriptor)
