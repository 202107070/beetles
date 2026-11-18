"""Contract tests for the focus-session router and SQLite store."""

from __future__ import annotations

import sqlite3
import sys
import types
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import Depends, FastAPI, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi.testclient import TestClient

# BE-1 owns app.core.security. Provide its documented contract only when that
# branch has not yet been merged, so this branch remains independently testable.
try:
    from app.core.security import require_demo_user  # type: ignore[import-not-found]
except ModuleNotFoundError:
    security_module = types.ModuleType("app.core.security")
    bearer = HTTPBearer(auto_error=False)

    def require_demo_user(
        credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    ) -> str:
        if credentials is None or credentials.credentials != "beetle-demo-token":
            raise HTTPException(status_code=401, detail="Not authenticated")
        return "demo-user"

    security_module.require_demo_user = require_demo_user
    sys.modules["app.core.security"] = security_module

from app.routers.sessions import router
from app.storage import sqlite as sqlite_store

AUTH_HEADERS = {"Authorization": "Bearer beetle-demo-token"}


@pytest.fixture
def client(tmp_path, monkeypatch) -> TestClient:
    monkeypatch.setattr(sqlite_store, "DB_PATH", tmp_path / "test.db")
    sqlite_store.init_db()
    app = FastAPI()
    app.include_router(router)
    with TestClient(app) as test_client:
        yield test_client


def _start(client: TestClient, duration_seconds: int = 60) -> dict:
    response = client.post(
        "/api/sessions",
        headers=AUTH_HEADERS,
        json={"duration_seconds": duration_seconds},
    )
    assert response.status_code == 201
    return response.json()


@pytest.mark.parametrize("duration_seconds", [10, 14400])
def test_accepts_duration_boundaries(client: TestClient, duration_seconds: int) -> None:
    session = _start(client, duration_seconds)
    assert session["duration_seconds"] == duration_seconds
    assert session["status"] == "active"
    assert session["warning_count"] == 0
    assert session["ended_at"] is None


@pytest.mark.parametrize("duration_seconds", [9, 14401, "60"])
def test_rejects_invalid_duration(
    client: TestClient, duration_seconds: object
) -> None:
    response = client.post(
        "/api/sessions",
        headers=AUTH_HEADERS,
        json={"duration_seconds": duration_seconds},
    )
    assert response.status_code == 422


def test_requires_authentication(client: TestClient) -> None:
    response = client.post("/api/sessions", json={"duration_seconds": 60})
    assert response.status_code == 401
    assert response.json() == {"detail": "Not authenticated"}


def test_rejects_second_open_session(client: TestClient) -> None:
    _start(client)
    response = client.post(
        "/api/sessions",
        headers=AUTH_HEADERS,
        json={"duration_seconds": 60},
    )
    assert response.status_code == 409
    assert response.json() == {"detail": "Active session already exists"}


def test_pause_and_resume_accumulates_paused_time(client: TestClient) -> None:
    session = _start(client)
    pause_response = client.post(
        f"/api/sessions/{session['id']}/pause", headers=AUTH_HEADERS
    )
    assert pause_response.status_code == 200
    assert pause_response.json()["status"] == "paused"

    old_pause_time = (
        datetime.now(timezone.utc) - timedelta(seconds=3.2)
    ).isoformat().replace("+00:00", "Z")
    with sqlite3.connect(sqlite_store.DB_PATH) as connection:
        connection.execute(
            "UPDATE sessions SET pause_started_at = ? WHERE id = ?",
            (old_pause_time, session["id"]),
        )

    resume_response = client.post(
        f"/api/sessions/{session['id']}/resume", headers=AUTH_HEADERS
    )
    assert resume_response.status_code == 200
    resumed = resume_response.json()
    assert resumed["status"] == "active"
    assert resumed["total_paused_seconds"] >= 3


def test_warning_increments_only_while_active(client: TestClient) -> None:
    session = _start(client)
    warning_url = f"/api/sessions/{session['id']}/warnings"

    warning_response = client.post(
        warning_url,
        headers=AUTH_HEADERS,
        json={"type": "eyes_closed"},
    )
    assert warning_response.status_code == 200
    assert warning_response.json()["warning_count"] == 1

    client.post(f"/api/sessions/{session['id']}/pause", headers=AUTH_HEADERS)
    paused_warning = client.post(
        warning_url,
        headers=AUTH_HEADERS,
        json={"type": "eyes_closed"},
    )
    assert paused_warning.status_code == 409

    client.post(f"/api/sessions/{session['id']}/resume", headers=AUTH_HEADERS)
    client.post(
        f"/api/sessions/{session['id']}/finish",
        headers=AUTH_HEADERS,
        json={"reason": "manual"},
    )
    finished_warning = client.post(
        warning_url,
        headers=AUTH_HEADERS,
        json={"type": "eyes_closed"},
    )
    assert finished_warning.status_code == 409


def test_rejects_unknown_warning_type(client: TestClient) -> None:
    session = _start(client)
    response = client.post(
        f"/api/sessions/{session['id']}/warnings",
        headers=AUTH_HEADERS,
        json={"type": "face_missing"},
    )
    assert response.status_code == 422


def test_completed_session_cannot_be_finished_again(client: TestClient) -> None:
    session = _start(client)
    finish_url = f"/api/sessions/{session['id']}/finish"
    first = client.post(
        finish_url,
        headers=AUTH_HEADERS,
        json={"reason": "completed"},
    )
    assert first.status_code == 200
    finished = first.json()
    assert finished["status"] == "completed"
    assert finished["ended_at"].endswith("Z")

    second = client.post(
        finish_url,
        headers=AUTH_HEADERS,
        json={"reason": "completed"},
    )
    assert second.status_code == 409
    assert second.json() == {"detail": "Invalid session state"}


def test_finishing_paused_session_accumulates_pause(client: TestClient) -> None:
    session = _start(client)
    client.post(f"/api/sessions/{session['id']}/pause", headers=AUTH_HEADERS)

    old_pause_time = (
        datetime.now(timezone.utc) - timedelta(seconds=2.2)
    ).isoformat().replace("+00:00", "Z")
    with sqlite3.connect(sqlite_store.DB_PATH) as connection:
        connection.execute(
            "UPDATE sessions SET pause_started_at = ? WHERE id = ?",
            (old_pause_time, session["id"]),
        )

    response = client.post(
        f"/api/sessions/{session['id']}/finish",
        headers=AUTH_HEADERS,
        json={"reason": "manual"},
    )
    assert response.status_code == 200
    assert response.json()["status"] == "stopped"
    assert response.json()["total_paused_seconds"] >= 2


def test_missing_session_is_indistinguishable_from_other_user(client: TestClient) -> None:
    response = client.post(
        "/api/sessions/not-a-session/pause", headers=AUTH_HEADERS
    )
    assert response.status_code == 404
    assert response.json() == {"detail": "Session not found"}


def test_schema_contains_only_session_summary_columns(client: TestClient) -> None:
    del client
    with sqlite3.connect(sqlite_store.DB_PATH) as connection:
        columns = {
            row[1]
            for row in connection.execute("PRAGMA table_info(sessions)").fetchall()
        }

    assert columns == {
        "id",
        "user_id",
        "duration_seconds",
        "status",
        "started_at",
        "ended_at",
        "pause_started_at",
        "total_paused_seconds",
        "warning_count",
        "finish_reason",
    }
    forbidden_terms = {"video", "image", "frame", "landmark", "blink", "biometric"}
    assert not any(
        forbidden in column.lower()
        for column in columns
        for forbidden in forbidden_terms
    )
