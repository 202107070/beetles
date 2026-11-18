"""SQLite persistence for focus-session summaries only."""

from __future__ import annotations

import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DB_PATH = Path(__file__).resolve().parents[2] / "beetles.db"

_OPEN_STATUSES = ("active", "paused")


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _to_iso(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _from_iso(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _connect() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH, timeout=5)
    connection.row_factory = sqlite3.Row
    return connection


def _row_to_dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    return dict(row) if row is not None else None


def _select_session(
    connection: sqlite3.Connection, session_id: str, user_id: str
) -> dict[str, Any] | None:
    row = connection.execute(
        "SELECT * FROM sessions WHERE id = ? AND user_id = ?",
        (session_id, user_id),
    ).fetchone()
    return _row_to_dict(row)


def init_db() -> None:
    """Create the single prototype table and its active-session index."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with _connect() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS sessions (
              id TEXT PRIMARY KEY,
              user_id TEXT NOT NULL,
              duration_seconds INTEGER NOT NULL,
              status TEXT NOT NULL,
              started_at TEXT NOT NULL,
              ended_at TEXT,
              pause_started_at TEXT,
              total_paused_seconds INTEGER NOT NULL DEFAULT 0,
              warning_count INTEGER NOT NULL DEFAULT 0,
              finish_reason TEXT
            )
            """
        )
        connection.execute(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_one_open_per_user
            ON sessions(user_id)
            WHERE status IN ('active', 'paused')
            """
        )


def get_session(session_id: str, user_id: str) -> dict[str, Any] | None:
    with _connect() as connection:
        return _select_session(connection, session_id, user_id)


def get_active_session(user_id: str) -> dict[str, Any] | None:
    with _connect() as connection:
        row = connection.execute(
            """
            SELECT * FROM sessions
            WHERE user_id = ? AND status IN (?, ?)
            ORDER BY started_at DESC
            LIMIT 1
            """,
            (user_id, *_OPEN_STATUSES),
        ).fetchone()
        return _row_to_dict(row)


def create_session(user_id: str, duration_seconds: int) -> dict[str, Any]:
    session_id = str(uuid.uuid4())
    started_at = _to_iso(_utc_now())
    with _connect() as connection:
        connection.execute(
            """
            INSERT INTO sessions (
              id, user_id, duration_seconds, status, started_at,
              total_paused_seconds, warning_count
            ) VALUES (?, ?, ?, 'active', ?, 0, 0)
            """,
            (session_id, user_id, duration_seconds, started_at),
        )
        session = _select_session(connection, session_id, user_id)
    if session is None:  # Defensive: INSERT succeeded, so this should be unreachable.
        raise RuntimeError("Created session could not be loaded")
    return session


def pause_session(session_id: str, user_id: str) -> dict[str, Any] | None:
    paused_at = _to_iso(_utc_now())
    with _connect() as connection:
        cursor = connection.execute(
            """
            UPDATE sessions
            SET status = 'paused', pause_started_at = ?
            WHERE id = ? AND user_id = ? AND status = 'active'
            """,
            (paused_at, session_id, user_id),
        )
        if cursor.rowcount != 1:
            return None
        return _select_session(connection, session_id, user_id)


def resume_session(session_id: str, user_id: str) -> dict[str, Any] | None:
    now = _utc_now()
    with _connect() as connection:
        current = _select_session(connection, session_id, user_id)
        if current is None or current["status"] != "paused":
            return None

        pause_started_at = current["pause_started_at"]
        if not pause_started_at:
            return None
        paused_seconds = max(0, int((now - _from_iso(pause_started_at)).total_seconds()))

        cursor = connection.execute(
            """
            UPDATE sessions
            SET status = 'active',
                pause_started_at = NULL,
                total_paused_seconds = total_paused_seconds + ?
            WHERE id = ? AND user_id = ? AND status = 'paused'
            """,
            (paused_seconds, session_id, user_id),
        )
        if cursor.rowcount != 1:
            return None
        return _select_session(connection, session_id, user_id)


def increment_warning(session_id: str, user_id: str) -> dict[str, Any] | None:
    with _connect() as connection:
        cursor = connection.execute(
            """
            UPDATE sessions
            SET warning_count = warning_count + 1
            WHERE id = ? AND user_id = ? AND status = 'active'
            """,
            (session_id, user_id),
        )
        if cursor.rowcount != 1:
            return None
        return _select_session(connection, session_id, user_id)


def finish_session(
    session_id: str, user_id: str, reason: str
) -> dict[str, Any] | None:
    now = _utc_now()
    ended_at = _to_iso(now)
    final_status = "completed" if reason == "completed" else "stopped"

    with _connect() as connection:
        current = _select_session(connection, session_id, user_id)
        if current is None or current["status"] not in _OPEN_STATUSES:
            return None

        paused_seconds = 0
        if current["status"] == "paused":
            pause_started_at = current["pause_started_at"]
            if pause_started_at:
                paused_seconds = max(
                    0, int((now - _from_iso(pause_started_at)).total_seconds())
                )

        cursor = connection.execute(
            """
            UPDATE sessions
            SET status = ?,
                ended_at = ?,
                pause_started_at = NULL,
                total_paused_seconds = total_paused_seconds + ?,
                finish_reason = ?
            WHERE id = ? AND user_id = ? AND status IN ('active', 'paused')
            """,
            (
                final_status,
                ended_at,
                paused_seconds,
                reason,
                session_id,
                user_id,
            ),
        )
        if cursor.rowcount != 1:
            return None
        return _select_session(connection, session_id, user_id)
