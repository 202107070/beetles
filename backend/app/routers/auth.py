import secrets

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.security import DEMO_TOKEN, DEMO_USER_ID

DEMO_USERNAME: str = "demo"
DEMO_PASSWORD: str = "beetle"

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


class DemoUser(BaseModel):
    id: str
    display_name: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str
    user: DemoUser


@router.post("/login", response_model=LoginResponse)
def login(request: LoginRequest) -> LoginResponse:
    username_matches = secrets.compare_digest(
        request.username.encode("utf-8"),
        DEMO_USERNAME.encode("utf-8"),
    )
    password_matches = secrets.compare_digest(
        request.password.encode("utf-8"),
        DEMO_PASSWORD.encode("utf-8"),
    )
    if not (username_matches and password_matches):
        raise HTTPException(status_code=401, detail="Invalid demo credentials")

    return LoginResponse(
        access_token=DEMO_TOKEN,
        token_type="bearer",
        user=DemoUser(id=DEMO_USER_ID, display_name="Demo User"),
    )
