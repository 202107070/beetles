from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from app.core.security import require_demo_user
from app.routers import auth

app = FastAPI()
app.include_router(auth.router)


@app.get("/protected")
def protected(user_id: str = Depends(require_demo_user)) -> dict[str, str]:
    return {"user_id": user_id}


client = TestClient(app)


def test_demo_login_returns_fixed_token() -> None:
    response = client.post(
        "/api/auth/login",
        json={"username": "demo", "password": "beetle"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "access_token": "beetle-demo-token",
        "token_type": "bearer",
        "user": {"id": "demo-user", "display_name": "Demo User"},
    }


def test_login_rejects_wrong_password() -> None:
    response = client.post(
        "/api/auth/login",
        json={"username": "demo", "password": "wrong"},
    )

    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid demo credentials"}


def test_login_rejects_unknown_username_with_same_message() -> None:
    response = client.post(
        "/api/auth/login",
        json={"username": "unknown", "password": "beetle"},
    )

    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid demo credentials"}


def test_login_rejects_non_ascii_credentials() -> None:
    response = client.post(
        "/api/auth/login",
        json={"username": "데모", "password": "비틀"},
    )

    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid demo credentials"}


def test_protected_endpoint_accepts_demo_token() -> None:
    response = client.get(
        "/protected",
        headers={"Authorization": "Bearer beetle-demo-token"},
    )

    assert response.status_code == 200
    assert response.json() == {"user_id": "demo-user"}


def test_protected_endpoint_rejects_missing_token() -> None:
    response = client.get("/protected")

    assert response.status_code == 401
    assert response.json() == {"detail": "Not authenticated"}


def test_protected_endpoint_rejects_wrong_token() -> None:
    response = client.get(
        "/protected",
        headers={"Authorization": "Bearer wrong-token"},
    )

    assert response.status_code == 401
    assert response.json() == {"detail": "Not authenticated"}


def test_protected_endpoint_rejects_non_bearer_scheme() -> None:
    response = client.get(
        "/protected",
        headers={"Authorization": "Basic ZGVtbzpiZWV0bGU="},
    )

    assert response.status_code == 401
    assert response.json() == {"detail": "Not authenticated"}
