import json
import tempfile
import unittest
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from services import shares
from services.shares import CreationLimit, ShareLimits, ShareStore

PLAN = {"version": 1, "title": "Übung", "route": [[52.5, 13.4], [52.5, 13.41]]}


class StoreTest(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.store = ShareStore(Path(self.folder.name) / "shares.sqlite")

    def tearDown(self):
        self.store.close()
        self.folder.cleanup()

    def test_a_share_reads_back_as_stored(self):
        share = self.store.create("plan", PLAN)
        found = self.store.find(share.token)
        self.assertEqual(("plan", PLAN), (found.kind, found.document))
        self.assertNotEqual(share.token, share.delete_token)
        self.assertGreaterEqual(len(share.token), 24)

    def test_only_the_delete_token_deletes(self):
        share = self.store.create("plan", PLAN)
        self.assertFalse(self.store.delete(share.token, share.token))
        self.assertFalse(self.store.delete(share.token, ""))
        self.assertTrue(self.store.delete(share.token, share.delete_token))
        self.assertIsNone(self.store.find(share.token))
        self.assertFalse(self.store.delete(share.token, share.delete_token))

    def test_shares_survive_a_restart(self):
        share = self.store.create("task", {"stretches": []})
        self.store.close()
        self.store = ShareStore(Path(self.folder.name) / "shares.sqlite")
        self.assertEqual(1, self.store.count())
        self.assertEqual("task", self.store.find(share.token).kind)


class CreationLimitTest(unittest.TestCase):
    def test_each_client_gets_its_own_hour(self):
        limit = CreationLimit(2)
        self.assertTrue(limit.allow("a", now=0))
        self.assertTrue(limit.allow("a", now=10))
        self.assertFalse(limit.allow("a", now=20))
        self.assertTrue(limit.allow("b", now=20))
        self.assertTrue(limit.allow("a", now=3601))

    def test_a_client_idle_for_an_hour_is_forgotten(self):
        limit = CreationLimit(2)
        limit.allow("a", now=0)
        limit.allow("b", now=3000)
        limit.forget_idle(now=3000)
        self.assertTrue(limit.tracks("a"))
        limit.forget_idle(now=3700)
        self.assertFalse(limit.tracks("a"))
        self.assertTrue(limit.tracks("b"))


class ApiTest(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        application = FastAPI()
        application.include_router(shares.router, prefix="/api")
        application.state.shares = ShareStore(Path(self.folder.name) / "shares.sqlite")
        application.state.share_limits = ShareLimits(max_bytes=2000, creation=CreationLimit(3))
        self.application = application
        self.client = TestClient(application)

    def tearDown(self):
        self.application.state.shares.close()
        self.folder.cleanup()

    def share(self, body: dict):
        return self.client.post("/api/shares", content=json.dumps(body), headers={"Content-Type": "application/json"})

    def test_share_open_and_delete(self):
        created = self.share({"kind": "plan", "document": PLAN})
        self.assertEqual(201, created.status_code)
        tokens = created.json()
        self.assertEqual({"token", "deleteToken"}, set(tokens))
        opened = self.client.get(f"/api/shares/{tokens['token']}")
        self.assertEqual({"kind": "plan", "document": PLAN}, opened.json())
        wrong = self.client.delete(f"/api/shares/{tokens['token']}", headers={"X-Delete-Token": tokens["token"]})
        self.assertEqual(404, wrong.status_code)
        deleted = self.client.delete(f"/api/shares/{tokens['token']}", headers={"X-Delete-Token": tokens["deleteToken"]})
        self.assertEqual(204, deleted.status_code)
        self.assertEqual(404, self.client.get(f"/api/shares/{tokens['token']}").status_code)

    def test_unknown_tokens_are_404(self):
        self.assertEqual(404, self.client.get("/api/shares/nothing").status_code)

    def test_only_known_kinds_and_objects_are_shared(self):
        for body in ({"kind": "board", "document": PLAN}, {"kind": "plan", "document": [1, 2]}, {"kind": "plan"}):
            self.assertEqual(422, self.share(body).status_code, body)
        self.assertEqual(422, self.client.post("/api/shares", content=b"not json").status_code)

    def test_large_documents_are_refused(self):
        response = self.share({"kind": "plan", "document": {"title": "x" * 3000}})
        self.assertEqual(413, response.status_code)

    def test_a_large_declared_length_is_refused_before_reading(self):
        response = self.client.post("/api/shares", content=b"{}", headers={"Content-Length": "999999999"})
        self.assertEqual(413, response.status_code)

    def test_a_large_body_without_declared_length_is_refused_while_reading(self):
        def chunks():
            for _ in range(10):
                yield b"x" * 500
        response = self.client.post("/api/shares", content=chunks())
        self.assertEqual(413, response.status_code)

    def test_nan_and_infinity_are_refused(self):
        for text in (b'{"kind": "plan", "document": {"a": NaN}}', b'{"kind": "plan", "document": {"a": Infinity}}'):
            self.assertEqual(422, self.client.post("/api/shares", content=text).status_code)

    def test_one_client_may_share_only_so_often(self):
        for _ in range(3):
            self.assertEqual(201, self.share({"kind": "task", "document": {}}).status_code)
        refused = self.share({"kind": "task", "document": {}})
        self.assertEqual(429, refused.status_code)
        self.assertIn("retry-after", refused.headers)


if __name__ == "__main__":
    unittest.main()
