import hashlib
import json
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path

from .config import AppError


class Storage:
    def __init__(self, root: Path):
        self.root = root
        root.mkdir(parents=True, exist_ok=True)
        (root / "files").mkdir(exist_ok=True)
        with self.connect() as db:
            db.execute("PRAGMA journal_mode=WAL")
            db.execute("CREATE TABLE IF NOT EXISTS records (id TEXT PRIMARY KEY, kind TEXT, body TEXT)")

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.root / "metadata.sqlite3", timeout=30)
        try:
            with db:
                yield db
        finally:
            db.close()

    def save(self, kind: str, body: dict) -> dict:
        body = {"id": uuid.uuid4().hex, "created_at": datetime.now(UTC).isoformat(), **body}
        with self.connect() as db:
            db.execute("INSERT INTO records VALUES (?, ?, ?)", (body["id"], kind, json.dumps(body)))
        return body

    def get(self, kind: str, record_id: str) -> dict:
        with self.connect() as db:
            row = db.execute("SELECT body FROM records WHERE id=? AND kind=?", (record_id, kind)).fetchone()
        if row is None:
            raise AppError(404, "not_found", f"{kind} not found")
        return json.loads(row[0])

    def list(self, kind: str) -> list[dict]:
        with self.connect() as db:
            return [json.loads(row[0]) for row in db.execute("SELECT body FROM records WHERE kind=?", (kind,))]

    def file(self, record: dict) -> Path:
        return self.root / "files" / record["stored_name"]

    def persist_file(self, kind: str, filename: str, content: bytes, extra: dict) -> dict:
        revision = hashlib.sha256(content).hexdigest()
        stored_name = revision + (".ifc" if kind == "model" else ".xlsx")
        path = self.root / "files" / stored_name
        try:
            with path.open("xb") as output:
                output.write(content)
        except FileExistsError:
            pass  # Content-addressed immutable files can be shared by multiple records.
        return self.save(kind, {"filename": Path(filename).name, "revision": revision,
                                "stored_name": stored_name, **extra})

    def public(self, record: dict) -> dict:
        return {k: v for k, v in record.items() if k != "stored_name"}
