import math
import random
import tempfile
import unittest
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from elevation.grid import BLOCK, HEADER, Geometry, GridError, GridFile, decode, encode, tile_name, write
from services import elevation
from services.elevation import ElevationModel, ElevationUnavailable, distance

ROWS, COLUMNS = 300, 280
STEP = 1 / 3600


def height_at(row: int, column: int) -> int:
    """A sloping test surface: 100 m at the top-left sample, rising 1 m per row and 2 m per column."""
    return 100 + row + 2 * column


def position(row: float, column: float) -> tuple[float, float]:
    """Return where a sample of the test tile N50E010 lies."""
    return 51.0 - row * STEP, 10.0 + column * STEP


def write_tile(directory: Path, latitude: int, longitude: int) -> Geometry:
    """Write a small grid file whose first sample lies on the tile's north-west corner, as in the
    source data."""
    geometry = Geometry(ROWS, COLUMNS, latitude + 1.0, float(longitude), STEP, STEP)
    heights = [[height_at(row, column) for column in range(COLUMNS)] for row in range(ROWS)]
    write(directory / tile_name(latitude, longitude), geometry, heights)
    return geometry


class GridTest(unittest.TestCase):
    def test_blocks_survive_encoding(self):
        generator = random.Random(4)
        rows = [[generator.randint(-50, 3000) for _ in range(37)] for _ in range(11)]
        decoded = decode(encode(rows), 37)
        self.assertEqual([value for row in rows for value in row], list(decoded))

    def test_a_file_reads_back_every_sample(self):
        with tempfile.TemporaryDirectory() as folder:
            geometry = write_tile(Path(folder), 50, 10)
            grid = GridFile(Path(folder) / "N50E010.dem")
            self.assertEqual(geometry, grid.geometry)
            for row, column in ((0, 0), (0, COLUMNS - 1), (BLOCK - 1, BLOCK), (ROWS - 1, COLUMNS - 1), (257, 3)):
                index, offset = grid.locate(row, column)
                self.assertEqual(height_at(row, column), grid.block(index)[offset], (row, column))
            grid.close()

    def test_other_files_are_refused(self):
        with tempfile.TemporaryDirectory() as folder:
            file = Path(folder) / "N50E010.dem"
            file.write_bytes(b"not a grid file at all, but long enough for a header....")
            with self.assertRaises(GridError):
                GridFile(file)
            file.write_bytes(b"short")
            with self.assertRaises(GridError):
                GridFile(file)

    def test_tile_names(self):
        self.assertEqual("N50E010.dem", tile_name(50, 10))
        self.assertEqual("N47E005.dem", tile_name(47, 5))

    def test_a_file_cut_inside_its_offsets_is_refused(self):
        with tempfile.TemporaryDirectory() as folder:
            write_tile(Path(folder), 50, 10)
            file = Path(folder) / "N50E010.dem"
            file.write_bytes(file.read_bytes()[:HEADER.size + 4])
            with self.assertRaises(GridError):
                GridFile(file)


class ModelTest(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        directory = Path(self.folder.name)
        write_tile(directory, 50, 10)
        (directory / "VERSION").write_text("test-dataset\n")
        self.model = ElevationModel(directory)

    def tearDown(self):
        self.model.close()
        self.folder.cleanup()

    def test_samples_are_exact(self):
        self.assertAlmostEqual(height_at(1, 1), self.model.height(*position(1, 1)))
        self.assertAlmostEqual(height_at(10, 20), self.model.height(*position(10, 20)))

    def test_between_samples_heights_are_interpolated(self):
        middle = self.model.height(*position(10.5, 20.5))
        self.assertAlmostEqual((height_at(10, 20) + height_at(11, 21)) / 2, middle)

    def test_at_the_edge_of_the_box_the_last_line_is_held(self):
        with tempfile.TemporaryDirectory() as folder:
            directory = Path(folder)
            (directory / "VERSION").write_text("test-dataset\n")
            write(directory / tile_name(50, 15), Geometry(2, 2, 50.5, 15.1 - 1.5 * STEP, STEP, STEP), [[100, 200]] * 2)
            model = ElevationModel(directory)
            self.assertAlmostEqual(200.0, model.height(50.5, 15.1))
            model.close()

    def test_a_missing_tile_in_the_box_is_the_sea(self):
        self.assertEqual(0.0, self.model.height(54.5, 7.5))

    def test_outside_the_box_there_is_no_height(self):
        self.assertIsNone(self.model.height(46.0, 10.0))
        self.assertIsNone(self.model.height(50.0, 16.0))

    def test_without_data_the_model_refuses(self):
        with tempfile.TemporaryDirectory() as folder:
            empty = ElevationModel(Path(folder))
            self.assertIsNone(empty.version)
            with self.assertRaises(ElevationUnavailable):
                empty.height(50.5, 10.5)

    def test_heights_run_on_across_a_seam_between_north_and_south(self):
        with tempfile.TemporaryDirectory() as folder:
            directory = Path(folder)
            (directory / "VERSION").write_text("test-dataset\n")
            north = Geometry(2, 2, 50.0 + 2 * STEP, 10.0, STEP, STEP)
            south = Geometry(2, 2, 50.0, 10.0, STEP, STEP)
            write(directory / tile_name(50, 10), north, [[100, 100], [200, 200]])
            write(directory / tile_name(49, 10), south, [[600, 600], [700, 700]])
            model = ElevationModel(directory)
            longitude = 10.0 + STEP / 2
            self.assertAlmostEqual(200.0, model.height(50.0 + STEP, longitude))
            self.assertAlmostEqual(400.0, model.height(50.0 + STEP / 2, longitude))
            self.assertAlmostEqual(300.0, model.height(50.0 + STEP * 0.75, longitude))
            self.assertAlmostEqual(600.0, model.height(50.0, longitude))
            self.assertAlmostEqual(650.0, model.height(50.0 - STEP / 2, longitude))
            model.close()

    def test_heights_run_on_across_a_seam_between_east_and_west(self):
        with tempfile.TemporaryDirectory() as folder:
            directory = Path(folder)
            (directory / "VERSION").write_text("test-dataset\n")
            west = Geometry(2, 2, 50.5, 11.0 - 2 * STEP, STEP, STEP)
            east = Geometry(2, 2, 50.5, 11.0, STEP, STEP)
            write(directory / tile_name(50, 10), west, [[100, 200], [100, 200]])
            write(directory / tile_name(50, 11), east, [[600, 700], [600, 700]])
            model = ElevationModel(directory)
            self.assertAlmostEqual(400.0, model.height(50.5, 11.0 - STEP / 2))
            self.assertAlmostEqual(300.0, model.height(50.5, 11.0 - STEP * 0.75))
            self.assertAlmostEqual(600.0, model.height(50.5, 11.0))
            model.close()

    def test_profile_samples_evenly_and_ends_at_the_end(self):
        start, end = position(10, 0), position(10, 200)
        profile = self.model.profile([start, end])
        self.assertAlmostEqual(distance(start, end), profile.length)
        self.assertEqual([0.0, profile.length], profile.vertices)
        steps = [b[0] - a[0] for a, b in zip(profile.samples, profile.samples[1:])]
        self.assertTrue(all(math.isclose(step, elevation.MIN_STEP) for step in steps[:-1]))
        self.assertAlmostEqual(profile.length, profile.samples[-1][0])
        self.assertAlmostEqual(height_at(10, 0), profile.samples[0][1])
        self.assertAlmostEqual(height_at(10, 200), profile.samples[-1][1])

    def test_profile_follows_each_segment(self):
        line = [position(100, 0), position(100, 100), position(0, 100)]
        profile = self.model.profile(line)
        self.assertEqual(3, len(profile.vertices))
        at_corner = min(profile.samples, key=lambda sample: abs(sample[0] - profile.vertices[1]))
        self.assertAlmostEqual(height_at(100, 100), at_corner[1], delta=2.5)

    def test_long_lines_are_sampled_more_coarsely(self):
        profile = self.model.profile([(48.0, 7.0), (54.0, 13.0)])
        self.assertLessEqual(len(profile.samples), elevation.MAX_SAMPLES + 1)


class ApiTest(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        directory = Path(self.folder.name)
        write_tile(directory, 50, 10)
        (directory / "VERSION").write_text("test-dataset\n")
        application = FastAPI()
        application.include_router(elevation.router, prefix="/api")
        application.state.elevation = ElevationModel(directory)
        self.model = application.state.elevation
        self.client = TestClient(application)

    def tearDown(self):
        self.model.close()
        self.folder.cleanup()

    def test_info_names_the_dataset_and_its_credit(self):
        body = self.client.get("/api/elevation").json()
        self.assertEqual("test-dataset", body["dataset"])
        self.assertIn("Copernicus", body["attribution"])

    def test_points(self):
        response = self.client.post("/api/elevation/points", json={"points": [list(position(1, 1)), [46.0, 10.0]]})
        self.assertEqual({"heights": [103.0, None]}, response.json())

    def test_profile(self):
        start, end = position(1, 1), position(1, 200)
        body = self.client.post("/api/elevation/profile", json={"line": [list(start), list(end)]}).json()
        self.assertAlmostEqual(distance(start, end), body["length"], delta=0.1)
        self.assertEqual(body["length"], body["samples"][-1][0])
        self.assertEqual([0.0, 103.0], body["samples"][0])

    def test_profiles_outside_the_box_are_refused(self):
        response = self.client.post("/api/elevation/profile", json={"line": [[51.0, 10.0], [46.0, 10.0]]})
        self.assertEqual(422, response.status_code)

    def test_overlong_profiles_are_refused(self):
        response = self.client.post("/api/elevation/profile", json={"line": [[48.0, 7.0], [54.0, 13.0]]})
        self.assertEqual(422, response.status_code)

    def test_malformed_requests_are_refused(self):
        for body in ({"points": []}, {"points": [[51.0]]}, {"line": [[51.0, 10.0]]},
                     {"points": [[51.0, 10.0]] * (elevation.MAX_POINTS + 1)}):
            path = "/api/elevation/points" if "points" in body else "/api/elevation/profile"
            self.assertEqual(422, self.client.post(path, json=body).status_code, body)

    def test_without_data_the_api_says_so(self):
        with tempfile.TemporaryDirectory() as folder:
            self.client.app.state.elevation = ElevationModel(Path(folder))
            self.assertEqual(503, self.client.get("/api/elevation").status_code)
            response = self.client.post("/api/elevation/points", json={"points": [[51.0, 10.0]]})
            self.assertEqual(503, response.status_code)


if __name__ == "__main__":
    unittest.main()
