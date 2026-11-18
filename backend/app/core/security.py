import secrets
from typing import Annotated

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

DEMO_TOKEN: str = "beetle-demo-token"
DEMO_USER_ID: str = "demo-user"

_bearer_scheme = HTTPBearer(auto_error=False)


def require_demo_user(
    credentials: Annotated[
        HTTPAuthorizationCredentials | None,
        Depends(_bearer_scheme),
    ],
) -> str:
    """Return the demo user ID when the fixed Bearer token is valid."""
    if (
        credentials is None
        or credentials.scheme.lower() != "bearer"
        or not secrets.compare_digest(
            credentials.credentials.encode("utf-8"),
            DEMO_TOKEN.encode("utf-8"),
        )
    ):
        raise HTTPException(status_code=401, detail="Not authenticated")

    return DEMO_USER_ID
