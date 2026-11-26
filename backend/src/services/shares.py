"""Shared lines and tasks: a snapshot stored under a token, opened by anyone with the link as a copy.

A share is never changed after it is made: whoever opens the link gets their own copy to work on,
so there is no live editing and nothing to keep in sync. Whoever made the share gets a second
token that deletes it; a share is kept until then. There are no accounts, and a share is found by
its token and nothing else.

A share is at most `SHARE_MAX_BYTES` of JSON, and one client address may make at most
`SHARE_CREATIONS_PER_HOUR` shares an hour, so the table cannot be flooded. The server only checks
that a document is a JSON object of a known kind; the browser reads every field of it with the same
checks as a document from its own storage.
"""

import asyncio
import json
import secrets
import sqlite3
import threading
import time
from collections import deque
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Header, HTTPException, Request, Response
from pydantic import BaseModel, Field

TOKEN_BYTES = 18

router = APIRouter(prefix="/shares")


@dataclass
class Share:
    """A stored share: what it holds and the two tokens that open and delete it."""

    token: str
    delete_token: str
    kind: str
    document: dict


class ShareStore:
    """The SQLite table of shares. Every statement holds one lock, since requests run in worker threads."""

    def __init__(self, file: Path) -> None:
        """Open or create the table of shares."""
        file.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._db = sqlite3.connect(file, check_same_thread=False, isolation_level=None)
        self._db.execute("PRAGMA journal_mode=WAL")
        self._db.execute("PRAGMA synchronous=NORMAL")
        self._db.execute(
            "CREATE TABLE IF NOT EXISTS shares (token TEXT PRIMARY KEY, delete_token TEXT UNIQUE NOT NULL,"
            " kind TEXT NOT NULL, document TEXT NOT NULL, created REAL NOT NULL)"
        )

    def create(self, kind: str, document: dict) -> Share:
        """Store a document under fresh tokens and return the share."""
        share = Share(secrets.token_urlsafe(TOKEN_BYTES), secrets.token_urlsafe(TOKEN_BYTES), kind, document)
        with self._lock:
            self._db.execute(
                "INSERT INTO shares VALUES (?, ?, ?, ?, ?)",
                (share.token, share.delete_token, kind, json.dumps(document, allow_nan=False), time.time()),
            )
        return share

    def find(self, token: str) -> Share | None:
        """Return the share a token opens, or None."""
        with self._lock:
            row = self._db.execute(
                "SELECT token, delete_token, kind, document FROM shares WHERE token = ?", (token,)
            ).fetchone()
        return None if row is None else Share(row[0], row[1], row[2], json.loads(row[3]))

    def delete(self, token: str, delete_token: str) -> bool:
        """Delete a share when the delete token matches; tell whether it was deleted."""
        share = self.find(token)
        if share is None or not secrets.compare_digest(share.delete_token, delete_token):
            return False
        with self._lock:
            self._db.execute("DELETE FROM shares WHERE token = ?", (token,))
        return True

    def count(self) -> int:
        """Return how many shares are stored."""
        with self._lock:
            return self._db.execute("SELECT COUNT(*) FROM shares").fetchone()[0]

    def close(self) -> None:
        """Close the database."""
        with self._lock:
            self._db.close()


class CreationLimit:
    """How many shares one client may make per hour."""

    def __init__(self, per_hour: int) -> None:
        """Allow `per_hour` creations per client within any hour."""
        self.per_hour = per_hour
        self._created: dict[str, deque[float]] = {}
        self._lock = threading.Lock()

    def allow(self, client: str, now: float | None = None) -> bool:
        """Count a creation for a client, or refuse it when the client is at the limit."""
        now = time.time() if now is None else now
        with self._lock:
            recent = self._created.setdefault(client, deque())
            while recent and now - recent[0] > 3600:
                recent.popleft()
            if len(recent) >= self.per_hour:
                return False
            recent.append(now)
            if len(self._created) > 10_000:
                self._created = {key: value for key, value in self._created.items() if value}
            return True


@dataclass
class ShareLimits:
    """How large a share may be and how many one client may make."""

    max_bytes: int
    creation: CreationLimit


class ShareRequest(BaseModel):
    """A document to share and what it is."""

    kind: Literal["plan", "task"]
    document: dict


class ShareCreated(BaseModel):
    """The token that opens the new share and the one that deletes it."""

    token: str
    delete_token: str = Field(serialization_alias="deleteToken")


class ShareContent(BaseModel):
    """What a share holds."""

    kind: str
    document: dict


async def limited_body(request: Request, limit: int) -> bytes:
    """Return the request body, refused with 413 as soon as it is known to exceed `limit` bytes:
    at once for a larger declared length, otherwise while reading, so an oversized body is never
    held in memory."""
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > limit:
        raise HTTPException(status_code=413, detail="Das ist zu groß zum Teilen.")
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > limit:
            raise HTTPException(status_code=413, detail="Das ist zu groß zum Teilen.")
    return bytes(body)


def reject_constant(name: str) -> None:
    """Refuse NaN and Infinity, which JSON itself does not know."""
    raise ValueError(f"{name} is not JSON")


@router.post("", status_code=201)
async def create(request: Request) -> ShareCreated:
    """Store a document and return its tokens, within the size and rate limits."""
    limits = request.app.state.share_limits
    body = await limited_body(request, limits.max_bytes)
    try:
        payload = ShareRequest.model_validate(json.loads(body, parse_constant=reject_constant))
    except ValueError as error:
        raise HTTPException(status_code=422, detail="Das lässt sich nicht teilen.") from error
    if not limits.creation.allow(request.client.host if request.client else ""):
        raise HTTPException(status_code=429, detail="Zu viele geteilte Links in kurzer Zeit.",
                            headers={"Retry-After": "3600"})
    share = await asyncio.to_thread(request.app.state.shares.create, payload.kind, payload.document)
    return ShareCreated(token=share.token, delete_token=share.delete_token)


@router.get("/{token}")
def read(token: str, request: Request) -> ShareContent:
    """Return what a share holds."""
    share = request.app.state.shares.find(token)
    if share is None:
        raise HTTPException(status_code=404, detail="Diesen Link gibt es nicht (mehr).")
    return ShareContent(kind=share.kind, document=share.document)


@router.delete("/{token}", status_code=204)
def delete(token: str, request: Request, x_delete_token: str = Header(default="")) -> Response:
    """Delete a share with its delete token."""
    if not request.app.state.shares.delete(token, x_delete_token):
        raise HTTPException(status_code=404, detail="Diesen Link gibt es nicht (mehr).")
    return Response(status_code=204)
