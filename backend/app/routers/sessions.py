"""Authenticated focus-session lifecycle endpoints."""

from __future__ import annotations

import sqlite3
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.core.security import require_demo_user
from app.storage.sqlite import (
    create_session,
    finish_session,
    get_active_session,
    get_session,
    increment_warning,
    pause_session,
    resume_session,
)

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


class StartSessionRequest(BaseModel):
    duration_seconds: int = Field(strict=True, ge=10, le=14400)


class WarningRequest(BaseModel):
    type: Literal["eyes_closed"]


class FinishSessionRequest(BaseModel):
    reason: Literal["completed", "manual", "logout", "error"]


class SessionResponse(BaseModel):
    id: str
    user_id: str
    duration_seconds: int
    status: Literal["active", "paused", "completed", "stopped"]
    started_at: str
    ended_at: str | None
    total_paused_seconds: int
    warning_count: int


def _load_session_or_404(session_id: str, user_id: str) -> dict:
    session = get_session(session_id, user_id)
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found",
        )
    return session


def _invalid_state() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail="Invalid session state",
    )


@router.post("", response_model=SessionResponse, status_code=status.HTTP_201_CREATED)
def start_focus_session(
    request: StartSessionRequest,
    user_id: str = Depends(require_demo_user),
) -> dict:
    if get_active_session(user_id) is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Active session already exists",
        )

    try:
        return create_session(user_id, request.duration_seconds)
    except sqlite3.IntegrityError as error:
        # The partial unique index closes the race between the check and INSERT.
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Active session already exists",
        ) from error


@router.post("/{session_id}/pause", response_model=SessionResponse)
def pause_focus_session(
    session_id: str,
    user_id: str = Depends(require_demo_user),
) -> dict:
    current = _load_session_or_404(session_id, user_id)
    if current["status"] != "active":
        raise _invalid_state()
    updated = pause_session(session_id, user_id)
    if updated is None:
        raise _invalid_state()
    return updated


@router.post("/{session_id}/resume", response_model=SessionResponse)
def resume_focus_session(
    session_id: str,
    user_id: str = Depends(require_demo_user),
) -> dict:
    current = _load_session_or_404(session_id, user_id)
    if current["status"] != "paused":
        raise _invalid_state()
    updated = resume_session(session_id, user_id)
    if updated is None:
        raise _invalid_state()
    return updated


@router.post("/{session_id}/warnings", response_model=SessionResponse)
def record_warning(
    session_id: str,
    request: WarningRequest,
    user_id: str = Depends(require_demo_user),
) -> dict:
    # The Literal request field validates that only an eyes-closed event is accepted.
    del request
    current = _load_session_or_404(session_id, user_id)
    if current["status"] != "active":
        raise _invalid_state()
    updated = increment_warning(session_id, user_id)
    if updated is None:
        raise _invalid_state()
    return updated


@router.post("/{session_id}/finish", response_model=SessionResponse)
def finish_focus_session(
    session_id: str,
    request: FinishSessionRequest,
    user_id: str = Depends(require_demo_user),
) -> dict:
    current = _load_session_or_404(session_id, user_id)
    if current["status"] not in {"active", "paused"}:
        raise _invalid_state()
    updated = finish_session(session_id, user_id, request.reason)
    if updated is None:
        raise _invalid_state()
    return updated
