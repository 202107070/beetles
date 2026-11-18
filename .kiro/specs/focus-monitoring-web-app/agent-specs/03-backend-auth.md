# BE-1 작업 명세: 데모 로그인과 인증

## 1. 목표

회원가입과 사용자 DB 없이 `demo / beetle` 계정만 허용하는 로그인 API와 보호 API용 Bearer 토큰 검사를 구현한다.

## 2. 브랜치와 소유 파일

- 브랜치: `agent/backend-auth`
- 역할 ID: `BE-1`
- 수정 가능:
  - `backend/app/routers/auth.py`
  - `backend/app/core/security.py`
  - `backend/tests/test_auth.py`
- 수정 금지: 위 목록 외 모든 파일

`backend/requirements.txt`, `main.py`, 패키지 `__init__.py`는 API-1 소유다.

## 3. 고정 인증 값

프로토타입에서만 다음 값을 사용한다.

```py
DEMO_USERNAME = "demo"
DEMO_PASSWORD = "beetle"
DEMO_TOKEN = "beetle-demo-token"
DEMO_USER_ID = "demo-user"
```

운영 인증이라고 표현하지 않는다. 비밀번호 해싱, JWT, 만료, 갱신 토큰은 구현하지 않는다.

## 4. `security.py` 계약

다음 이름을 export한다.

```py
from typing import Annotated
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

DEMO_TOKEN: str
DEMO_USER_ID: str

def require_demo_user(...) -> str:
    """유효한 데모 Bearer 토큰이면 demo-user를 반환한다."""
```

구현 규칙:

- `HTTPBearer(auto_error=False)`를 사용한다.
- 자격 증명이 없거나 scheme이 Bearer가 아니거나 token이 다르면 status 401을 반환한다.
- 오류 body는 `{"detail":"Not authenticated"}`다.
- 비교에는 `secrets.compare_digest`를 사용한다.
- 성공 시 문자열 `demo-user`를 반환한다.

BE-2는 다음 방식으로 사용한다.

```py
user_id: str = Depends(require_demo_user)
```

함수명과 반환값을 변경하지 않는다.

## 5. `auth.py` 계약

라우터:

```py
router = APIRouter(prefix="/api/auth", tags=["auth"])
```

요청·응답 모델은 이 파일 안에 정의하여 다른 담당 파일을 수정하지 않는다.

```py
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
```

엔드포인트:

```http
POST /api/auth/login
```

성공 조건은 username과 password가 각각 고정값과 정확히 일치하는 경우다.

성공 응답 200:

```json
{
  "access_token": "beetle-demo-token",
  "token_type": "bearer",
  "user": {"id": "demo-user", "display_name": "Demo User"}
}
```

실패 응답 401:

```json
{"detail":"Invalid demo credentials"}
```

잘못된 username과 password 중 무엇이 틀렸는지 구분하지 않는다.

## 6. 테스트

`test_auth.py`는 `main.py`에 의존하지 않고 작은 FastAPI 앱에 auth router를 붙여 테스트할 수 있다.

필수 테스트:

1. `demo / beetle`은 200과 정확한 토큰을 반환한다.
2. 잘못된 비밀번호는 401이다.
3. 존재하지 않는 사용자명도 같은 401 메시지다.
4. 보호 테스트용 endpoint에서 유효 토큰은 `demo-user`를 반환한다.
5. 토큰 누락은 401이다.
6. 잘못된 토큰은 401이다.

예시 테스트 앱:

```py
app = FastAPI()
app.include_router(auth.router)

@app.get("/protected")
def protected(user_id: str = Depends(require_demo_user)):
    return {"user_id": user_id}
```

## 7. 보안 및 로그 기준

- 로그인 요청 body를 로그로 출력하지 않는다.
- 토큰을 로그로 출력하지 않는다.
- CORS는 이 담당 범위가 아니다.
- 쿠키를 만들지 않는다.
- 데모 토큰 외 임의 토큰을 허용하지 않는다.

## 8. 구현하지 않을 것

- 사용자 테이블
- 회원가입
- 비밀번호 해싱
- JWT 라이브러리
- 토큰 만료·갱신·폐기 목록
- 세션 API

## 9. 자체 검수

의존성이 준비된 통합 환경에서:

```bash
cd backend
python -m pytest -q tests/test_auth.py
```

추가 확인:

```bash
python -m py_compile app/routers/auth.py app/core/security.py
```

API 계약과 오류 문자열을 정확히 지켰는지 확인한다.

## 10. 완료 커밋

```bash
git add backend/app/routers/auth.py backend/app/core/security.py backend/tests/test_auth.py
git commit -m "feat(auth): add fixed demo login and bearer guard"
```
