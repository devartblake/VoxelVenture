"""The messaging database: SQLite, one connection, used from the event loop only (so there is never a second writer in here)."""
from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from pathlib import Path

SCHEMA = (Path(__file__).resolve().parent / 'schema.sql').read_text(encoding='utf-8')


def open_db(path: str) -> sqlite3.Connection:
    if path != ':memory:':
        Path(path).parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(path, isolation_level=None, check_same_thread=False)  # autocommit; transactions are explicit
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA foreign_keys = ON')
    db.execute('PRAGMA journal_mode = WAL')
    db.execute('PRAGMA busy_timeout = 5000')
    db.executescript(SCHEMA)
    return db


@contextmanager
def transaction(db: sqlite3.Connection):
    """All or nothing, and nobody else writes meanwhile. Never await inside one."""
    db.execute('BEGIN IMMEDIATE')
    try:
        yield db
        db.execute('COMMIT')
    except BaseException:
        db.execute('ROLLBACK')
        raise
