# BE-2 작업 명세: SQLite 집중 세션 API

## 1. 목표

인증된 데모 사용자의 집중 세션 시작, 일시정지, 재개, 눈 감김 경고 횟수 증가, 종료를 단일 SQLite 테이블에 저장한다.

## 2. 브랜치와 소유 파일

- 브랜치: `agent/backend-session`
- 역할 ID: `BE-2`
- 수정 가능:
  - `backend/app/routers/sessions.py`
  - `backend/app/storage/sqlite.py`
  - `backend/tests/test_sessions.py`
- 수정 금지: 위 목록 외 모든 파일

BE-1의 `require_demo_user`가 최종 병합 시 존재한다고 가정한다. 해당 함수를 복사하거나 대신 구현하지 않는다.

## 3. 저장소 구현

### 3.1 DB 위치

`sqlite.py`:

```py
DB_PATH = Path(__file__).resolve().parents[2] / "beetles.db"
```

각 작업마다 새 연결을 만들고 context manager로 닫는다. `sqlite3.Row`를 사용한다. 영상·프레임·랜드마크·blink score 컬럼을 만들지 않는다.

### 3.2 스키마

```sql
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
);
```

필요하면 활성 세션 검색을 위한 일반 index 하나를 추가할 수 있다. migration 도구는 쓰지 않는다.

### 3.3 export 함수

함수명은 다음으로 고정한다.

```py
def init_db() -> None: ...
def get_session(session_id: str, user_id: str) -> dict | None: ...
def get_active_session(user_id: str) -> dict | None: ...
def create_session(user_id: str, duration_seconds: int) -> dict: ...
def pause_session(session_id: str, user_id: str) -> dict | None: ...
def resume_session(session_id: str, user_id: str) -> dict | None: ...
def increment_warning(session_id: str, user_id: str) -> dict | None: ...
def finish_session(session_id: str, user_id: str, reason: str) -> dict | None: ...
```

테스트가 임시 경로를 monkeypatch할 수 있도록 모든 함수가 모듈 전역 `DB_PATH`를 실행 시점에 읽게 한다.

시간은 timezone-aware UTC를 사용하고 JSON에 바로 넣을 수 있는 ISO 8601 문자열로 저장한다. 가능하면 `+00:00` 대신 `Z`로 끝나게 통일한다.

## 4. 상태 전이

허용 상태:

- `active`
- `paused`
- `completed`
- `stopped`

규칙:

- 시작: 새 row는 `active`
- 일시정지: `active → paused`, `pause_started_at` 기록
- 재개: `paused → active`, 실제 일시정지 초를 `total_paused_seconds`에 더하고 `pause_started_at` 제거
- 경고 증가: `active`일 때만 `warning_count + 1`
- 종료 reason이 `completed`: 현재 `active|paused → completed`
- 다른 종료 reason: 현재 `active|paused → stopped`
- paused 상태에서 종료하면 현재 일시정지 구간을 누적한 뒤 종료
- 이미 끝난 세션을 다시 바꾸지 않음

같은 사용자의 `active` 또는 `paused` 세션이 있으면 새 세션 생성 요청을 409로 거절한다.

## 5. `sessions.py` 계약

라우터:

```py
router = APIRouter(prefix="/api/sessions", tags=["sessions"])
```

모든 endpoint에 다음 의존성을 둔다.

```py
user_id: str = Depends(require_demo_user)
```

요청 모델은 이 파일 안에 둔다.

```py
class StartSessionRequest(BaseModel):
    duration_seconds: int = Field(ge=10, le=14400)

class WarningRequest(BaseModel):
    type: Literal["eyes_closed"]

class FinishSessionRequest(BaseModel):
    reason: Literal["completed", "manual", "logout", "error"]
```

응답은 다음 필드만 포함한다.

```json
{
  "id": "uuid",
  "user_id": "demo-user",
  "duration_seconds": 1500,
  "status": "active",
  "started_at": "UTC ISO string",
  "ended_at": null,
  "total_paused_seconds": 0,
  "warning_count": 0
}
```

내부 필드 `pause_started_at`과 `finish_reason`은 응답에서 제외해도 된다. 모든 endpoint에서 응답 형태를 동일하게 유지한다.

## 6. 엔드포인트

### 세션 시작

```http
POST /api/sessions
```

- 유효 범위: 10~14,400초 정수
- ID: `str(uuid.uuid4())`
- 성공: 201
- 기존 활성/일시정지 세션: 409 `{"detail":"Active session already exists"}`

### 일시정지

```http
POST /api/sessions/{session_id}/pause
```

- active만 허용
- 없는 세션 또는 다른 사용자 세션: 404 `{"detail":"Session not found"}`
- 잘못된 상태: 409 `{"detail":"Invalid session state"}`

### 재개

```http
POST /api/sessions/{session_id}/resume
```

- paused만 허용
- 나머지 오류 규칙은 일시정지와 동일

### 경고 기록

```http
POST /api/sessions/{session_id}/warnings
```

- body type은 `eyes_closed`만 허용
- active만 허용
- 성공 시 warning_count가 정확히 1 증가
- 경고 영상이나 점수는 받지 않음

### 종료

```http
POST /api/sessions/{session_id}/finish
```

- active 또는 paused만 허용
- 성공 시 ended_at 기록
- completed reason은 completed 상태, 나머지는 stopped 상태

## 7. 원자성

쓰기 함수는 한 연결의 transaction 안에서 현재 상태를 확인하고 UPDATE한다. 30분 범위에서 복잡한 ORM은 사용하지 않는다. 동시에 두 번 종료하거나 경고가 제출되어 데이터가 깨지는 것을 막기 위해 상태 조건을 UPDATE의 WHERE 절에 포함하는 방식을 권장한다.

## 8. 초기화

API-1의 FastAPI lifespan이 `init_db()`를 호출한다. 모듈 import만으로 파일을 생성하는 side effect는 만들지 않는다.

## 9. 테스트

`test_sessions.py`는 `tmp_path`의 DB를 사용한다.

```py
monkeypatch.setattr(sqlite_module, "DB_PATH", tmp_path / "test.db")
init_db()
```

필수 테스트:

1. 10초와 14,400초 세션 생성 성공
2. 범위 밖 값은 422
3. 무인증 요청은 401
4. 같은 사용자 활성 세션 중복 생성은 409
5. active 세션 pause 성공
6. paused 세션 resume 성공 및 pause 시간 누적
7. active 세션 경고 횟수 1 증가
8. paused 또는 종료 세션 경고는 409
9. completed 종료 결과 검증
10. 종료된 세션 재종료는 409
11. DB schema에 영상/이미지/landmark 관련 컬럼이 없음

테스트 앱에서 lifespan이 없으면 fixture가 직접 `init_db()`를 호출한다. `main.py`를 수정하지 않는다.

## 10. 구현하지 않을 것

- 사용자 테이블과 외래키
- ORM, migration
- 세션 목록·삭제 API
- 통계 집계
- 영상 또는 생체 데이터
- 재시도 큐와 idempotency key

## 11. 자체 검수

```bash
cd backend
python -m pytest -q tests/test_sessions.py
python -m py_compile app/routers/sessions.py app/storage/sqlite.py
```

최종 확인:

```bash
sqlite3 beetles.db '.schema sessions'
```

스키마에 요구된 세션 요약 외 데이터가 없는지 확인한다.

## 12. 완료 커밋

```bash
git add backend/app/routers/sessions.py backend/app/storage/sqlite.py backend/tests/test_sessions.py
git commit -m "feat(sessions): add sqlite focus session lifecycle"
```
