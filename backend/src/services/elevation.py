"""Heights from the elevation data the image carries, for single points and along a line.

The data is the Copernicus DEM GLO-30, a surface model at about 30 m spacing, in whole metres
(`elevation.grid`). Heights between samples are interpolated bilinearly. Inside the covered box a
tile the dataset does not have lies on the sea and reads as 0 m; outside the box there is no
height at all. Positions are only ever sent in request bodies and never logged, so no third party
and no log sees where a line runs.
"""

import math
import threading
from array import array
from collections import OrderedDict
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from elevation.grid import COVERAGE, GridFile, tile_name

EARTH_RADIUS = 6_371_008.8
CACHED_BLOCKS = 256
MAX_POINTS = 50
SEAM_TOLERANCE = 1e-6
MAX_VERTICES = 500
MAX_LINE_LENGTH = 100_000.0
MIN_STEP = 10.0
MAX_SAMPLES = 4000
ATTRIBUTION = ("Höhen: Copernicus DEM GLO-30 © DLR e.V. 2010–2014 und © Airbus Defence and Space GmbH "
               "2014–2018, bereitgestellt unter COPERNICUS von der Europäischen Union und der ESA; alle Rechte vorbehalten")

router = APIRouter(prefix="/elevation")

Position = Annotated[list[float], Field(min_length=2, max_length=2)]


def covered(latitude: float, longitude: float) -> bool:
    """Tell whether a position lies in the box the data covers."""
    west, south, east, north = COVERAGE
    return south <= latitude <= north and west <= longitude <= east


def distance(start: tuple[float, float], end: tuple[float, float]) -> float:
    """Return the great-circle distance between two positions in metres."""
    phi1, phi2 = math.radians(start[0]), math.radians(end[0])
    half_dphi = (phi2 - phi1) / 2
    half_dlambda = math.radians(end[1] - start[1]) / 2
    a = math.sin(half_dphi) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(half_dlambda) ** 2
    return 2 * EARTH_RADIUS * math.asin(min(1.0, math.sqrt(a)))


@dataclass
class Profile:
    """Heights along a line: its length, where each vertex lies along it, and (distance, height)
    samples from start to end, all in metres."""

    length: float
    vertices: list[float]
    samples: list[tuple[float, float]]


class ElevationUnavailable(Exception):
    """The server has no elevation data."""


class ElevationModel:
    """The grid files of one directory, opened on first use, with the most recently used decoded
    blocks kept in memory. Requests run in worker threads, so the cache is guarded by a lock."""

    def __init__(self, directory: Path) -> None:
        """Use the grid files in `directory`, which names its dataset in a `VERSION` file."""
        self.directory = directory
        version = directory / "VERSION"
        self.version = version.read_text().strip() if version.is_file() else None
        self._files: dict[str, GridFile | None] = {}
        self._blocks: OrderedDict[tuple[str, int], array] = OrderedDict()
        self._lock = threading.Lock()

    def height(self, latitude: float, longitude: float) -> float | None:
        """Return the height at a position in metres, or None outside the covered box."""
        if self.version is None:
            raise ElevationUnavailable
        if not covered(latitude, longitude):
            return None
        return self._height_in((math.floor(latitude), math.floor(longitude)), latitude, longitude)

    def _height_in(self, tile: tuple[int, int], latitude: float, longitude: float) -> float:
        """Return the height at a position from the given whole-degree tile.

        A tile's samples start on its north and west edge, so a strip along its south and east
        edge lies beyond its last sample line. There the height runs on towards the first line of
        the neighbouring tile, taken from that tile directly; at the edge of the covered box the
        last line is held.
        """
        name = tile_name(*tile)
        grid = self._file(name)
        if grid is None:
            return 0.0
        geometry = grid.geometry
        row = (geometry.north - latitude) / geometry.latitude_step
        column = (longitude - geometry.west) / geometry.longitude_step
        last_row, last_column = geometry.rows - 1, geometry.columns - 1
        if row > last_row + SEAM_TOLERANCE or row < -SEAM_TOLERANCE:
            southward = row > 0
            edge = geometry.north - (last_row if southward else 0) * geometry.latitude_step
            beyond = edge - geometry.latitude_step if southward else edge + geometry.latitude_step
            neighbour = (tile[0] - 1 if southward else tile[0] + 1, tile[1])
            return self._across_seam(tile, neighbour, latitude, edge, beyond, (edge, longitude), (beyond, longitude))
        if column > last_column + SEAM_TOLERANCE or column < -SEAM_TOLERANCE:
            eastward = column > 0
            edge = geometry.west + (last_column if eastward else 0) * geometry.longitude_step
            beyond = edge + geometry.longitude_step if eastward else edge - geometry.longitude_step
            neighbour = (tile[0], tile[1] + 1 if eastward else tile[1] - 1)
            return self._across_seam(tile, neighbour, longitude, edge, beyond, (latitude, edge), (latitude, beyond))
        row = min(max(row, 0.0), float(last_row))
        column = min(max(column, 0.0), float(last_column))
        top, left = int(row), int(column)
        bottom, right = min(top + 1, last_row), min(left + 1, last_column)
        down, across = row - top, column - left
        upper = self._sample(name, grid, top, left) * (1 - across) + self._sample(name, grid, top, right) * across
        lower = self._sample(name, grid, bottom, left) * (1 - across) + self._sample(name, grid, bottom, right) * across
        return upper * (1 - down) + lower * down

    def _across_seam(
        self, tile: tuple[int, int], neighbour: tuple[int, int], at: float, edge: float, beyond: float,
        edge_position: tuple[float, float], beyond_position: tuple[float, float],
    ) -> float:
        """Interpolate between a tile's outermost sample line and the first line of its neighbour,
        for a position in the strip between them, `at` being its coordinate across the seam."""
        inside = self._height_in(tile, *edge_position)
        if not covered(*beyond_position):
            return inside
        outside = self._height_in(neighbour, *beyond_position)
        share = min(max((at - edge) / (beyond - edge), 0.0), 1.0)
        return inside * (1 - share) + outside * share

    def profile(self, line: list[tuple[float, float]]) -> Profile:
        """Return the heights along a line given as its vertices, sampled at even steps of at least
        `MIN_STEP`, wider on long lines so there are at most `MAX_SAMPLES`, plus its end."""
        lengths = [distance(start, end) for start, end in zip(line, line[1:])]
        vertices = [0.0]
        for length in lengths:
            vertices.append(vertices[-1] + length)
        total = vertices[-1]
        step = max(MIN_STEP, total / MAX_SAMPLES)
        count = math.floor(total / step)
        positions = [step * index for index in range(count + 1)]
        if total - positions[-1] > 1e-6:
            positions.append(total)
        samples = []
        segment = 0
        for at in positions:
            while segment < len(lengths) - 1 and at > vertices[segment + 1]:
                segment += 1
            share = 0.0 if lengths[segment] == 0 else (at - vertices[segment]) / lengths[segment]
            (start_latitude, start_longitude), (end_latitude, end_longitude) = line[segment], line[segment + 1]
            height = self.height(start_latitude + (end_latitude - start_latitude) * share,
                                 start_longitude + (end_longitude - start_longitude) * share)
            samples.append((at, 0.0 if height is None else height))
        return Profile(total, vertices, samples)

    def close(self) -> None:
        """Close every opened file."""
        with self._lock:
            for grid in self._files.values():
                if grid is not None:
                    grid.close()
            self._files.clear()
            self._blocks.clear()

    def _file(self, name: str) -> GridFile | None:
        """Return an opened grid file, or None when the dataset has no tile there."""
        with self._lock:
            if name not in self._files:
                path = self.directory / name
                self._files[name] = GridFile(path) if path.is_file() else None
            return self._files[name]

    def _sample(self, name: str, grid: GridFile, row: int, column: int) -> int:
        """Return one stored height, decoding its block unless it is cached."""
        index, offset = grid.locate(row, column)
        key = (name, index)
        with self._lock:
            block = self._blocks.get(key)
            if block is not None:
                self._blocks.move_to_end(key)
                return block[offset]
        block = grid.block(index)
        with self._lock:
            self._blocks[key] = block
            while len(self._blocks) > CACHED_BLOCKS:
                self._blocks.popitem(last=False)
        return block[offset]


class PointsRequest(BaseModel):
    """Positions as [latitude, longitude]."""

    points: Annotated[list[Position], Field(min_length=1, max_length=MAX_POINTS)]


class PointsResponse(BaseModel):
    """The height of each position in metres, null outside the covered box."""

    heights: list[float | None]


class ProfileRequest(BaseModel):
    """A line as its vertices, each [latitude, longitude]."""

    line: Annotated[list[Position], Field(min_length=2, max_length=MAX_VERTICES)]


class ProfileResponse(BaseModel):
    """See `Profile`; samples are [distance, height]."""

    length: float
    vertices: list[float]
    samples: list[tuple[float, float]]


class InfoResponse(BaseModel):
    """Which dataset the heights come from and how it has to be credited."""

    dataset: str
    attribution: str


def _model(request: Request) -> ElevationModel:
    """Return the application's elevation model, refusing when it has no data."""
    model: ElevationModel = request.app.state.elevation
    if model.version is None:
        raise HTTPException(status_code=503, detail="Auf diesem Server liegen keine Höhendaten.")
    return model


def _round(value: float) -> float:
    """Round a height or distance to decimetres, as precise as the data is."""
    return round(value, 1)


def _positions(raw: Iterable[list[float]]) -> list[tuple[float, float]]:
    """Return positions as tuples, refusing any outside the covered box."""
    positions = [(latitude, longitude) for latitude, longitude in raw]
    if not all(covered(*position) for position in positions):
        raise HTTPException(status_code=422, detail="Die Strecke liegt außerhalb des Gebiets mit Höhendaten.")
    return positions


@router.get("")
def info(request: Request) -> InfoResponse:
    """Return which dataset the heights come from."""
    return InfoResponse(dataset=_model(request).version, attribution=ATTRIBUTION)


@router.post("/points")
def points(body: PointsRequest, request: Request) -> PointsResponse:
    """Return the height of each position."""
    model = _model(request)
    heights = [model.height(latitude, longitude) for latitude, longitude in body.points]
    return PointsResponse(heights=[None if height is None else _round(height) for height in heights])


@router.post("/profile")
def profile(body: ProfileRequest, request: Request) -> ProfileResponse:
    """Return the heights along a line."""
    model = _model(request)
    result = model.profile(_positions(body.line))
    if result.length > MAX_LINE_LENGTH:
        raise HTTPException(status_code=422, detail="Die Strecke ist länger als 100 km.")
    return ProfileResponse(
        length=_round(result.length),
        vertices=[_round(at) for at in result.vertices],
        samples=[(_round(at), _round(height)) for at, height in result.samples],
    )
