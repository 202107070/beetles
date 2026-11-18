"""FastAPI application assembly for the Beetles prototype."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers.auth import router as auth_router
from app.routers.sessions import router as sessions_router
from app.storage.sqlite import init_db


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    """Initialize persistent storage before accepting requests."""
    init_db()
    yield


app = FastAPI(title="비틀비틀 API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(auth_router)
app.include_router(sessions_router)


@app.get("/api/health")
def health() -> dict[str, str]:
    """Return a lightweight process health response."""
    return {"status": "ok"}
