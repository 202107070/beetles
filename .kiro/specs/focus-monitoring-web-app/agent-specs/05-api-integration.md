# API-1 작업 명세: 공용 계약, 프로젝트 골격, 통합 검수

## 1. 목표

프론트엔드와 백엔드가 다른 브랜치에서 작성되어도 최종 병합 즉시 연결되도록 프로젝트 골격, 의존성, TypeScript 계약, fetch 클라이언트, FastAPI 조립 코드를 구현한다. 마지막 통합 검수도 담당한다.

## 2. 브랜치와 소유 파일

- 브랜치: `agent/api-integration`
- 역할 ID: `API-1`
- 수정 가능:
  - `.gitignore`
  - `README.md`
  - `backend/requirements.txt`
  - `backend/app/__init__.py`
  - `backend/app/main.py`
  - `backend/app/routers/__init__.py`
  - `backend/app/core/__init__.py`
  - `backend/app/storage/__init__.py`
  - `frontend/package.json`
  - `frontend/package-lock.json`
  - `frontend/index.html`
  - `frontend/tsconfig.json`
  - `frontend/vite.config.ts`
  - `frontend/src/main.tsx`
  - `frontend/src/api/client.ts`
  - `frontend/src/contracts/api.ts`
- 수정 금지: 위 목록 외 모든 구현 파일

최종 통합 오류가 다른 담당자의 파일에서 발생하면 직접 수정하지 않고 해당 담당자에게 돌려보낸다.

## 3. 백엔드 골격

### 3.1 의존성

`backend/requirements.txt`는 버전을 지나치게 세분화하지 않고 다음을 포함한다.

```text
fastapi>=0.115,<1
uvicorn[standard]>=0.30,<1
pytest>=8,<9
httpx>=0.27,<1
```

SQLite는 Python 표준 라이브러리를 사용한다. ORM과 JWT 패키지를 추가하지 않는다.

### 3.2 `main.py`

다음을 구현한다.

- FastAPI title: `비틀비틀 API`
- lifespan 시작 시 `init_db()` 호출
- CORS 허용 origin: `http://localhost:5173`
- 허용 method/header: 프로토타입에서는 `*`
- auth router와 sessions router 등록
- `GET /api/health` → `{"status":"ok"}`

기대 import:

```py
from app.routers.auth import router as auth_router
from app.routers.sessions import router as sessions_router
from app.storage.sqlite import init_db
```

CORS에서 credentials는 필요하지 않으므로 `allow_credentials=False`를 사용한다. 인증은 Authorization 헤더로 전달한다.

## 4. 프론트엔드 골격

### 4.1 의존성

`package.json`은 다음 범위만 포함한다.

런타임:

- `react`
- `react-dom`
- `@mediapipe/tasks-vision`

개발:

- `typescript`
- `vite`
- `@vitejs/plugin-react`
- `@types/react`
- `@types/react-dom`

스크립트:

```json
{
  "dev": "vite",
  "build": "tsc -b && vite build",
  "preview": "vite preview"
}
```

React Router, Axios, 상태 관리, CSS 프레임워크를 추가하지 않는다.

### 4.2 `main.tsx`

정확한 조립:

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { EyeMonitorProvider } from './monitoring/EyeMonitorContext';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <EyeMonitorProvider>
      <App />
    </EyeMonitorProvider>
  </React.StrictMode>,
);
```

FE-1은 named export `App`, FE-2는 named export `EyeMonitorProvider`를 제공해야 한다.

## 5. TypeScript API 계약

`frontend/src/contracts/api.ts`에서 다음 타입을 정확히 export한다.

```ts
export interface DemoUser {
  id: string;
  display_name: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: 'bearer';
  user: DemoUser;
}

export type SessionStatus = 'active' | 'paused' | 'completed' | 'stopped';
export type FinishReason = 'completed' | 'manual' | 'logout' | 'error';

export interface SessionRecord {
  id: string;
  user_id: string;
  duration_seconds: number;
  status: SessionStatus;
  started_at: string;
  ended_at: string | null;
  total_paused_seconds: number;
  warning_count: number;
}
```

필드명에 camelCase 변환을 넣지 않는다. API JSON과 동일한 snake_case를 사용한다.

## 6. API 클라이언트

`frontend/src/api/client.ts`에서 다음을 export한다.

```ts
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string);
}

export const apiClient: {
  login(username: string, password: string): Promise<AuthResponse>;
  startSession(token: string, durationSeconds: number): Promise<SessionRecord>;
  pauseSession(token: string, sessionId: string): Promise<SessionRecord>;
  resumeSession(token: string, sessionId: string): Promise<SessionRecord>;
  recordWarning(token: string, sessionId: string): Promise<SessionRecord>;
  finishSession(token: string, sessionId: string, reason: FinishReason): Promise<SessionRecord>;
};
```

기본 URL:

```ts
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api';
```

공통 request helper 규칙:

- body가 있으면 `Content-Type: application/json`
- token이 있으면 `Authorization: Bearer ${token}`
- 204 외 성공 응답은 JSON parse
- 실패 body의 `detail`이 문자열이면 해당 메시지 사용
- parse 불가하면 `Request failed with status N`
- 네트워크 오류는 `ApiError(0, 'API server is unavailable')`로 변환
- retry는 구현하지 않음

endpoint mapping:

| 메서드 | HTTP |
|---|---|
| login | `POST /auth/login` |
| startSession | `POST /sessions` body `{duration_seconds}` |
| pauseSession | `POST /sessions/{id}/pause` |
| resumeSession | `POST /sessions/{id}/resume` |
| recordWarning | `POST /sessions/{id}/warnings` body `{type:'eyes_closed'}` |
| finishSession | `POST /sessions/{id}/finish` body `{reason}` |

경로의 session ID는 `encodeURIComponent`를 사용한다.

## 7. 설정 파일

### `.gitignore`

최소 다음을 제외한다.

```text
.DS_Store
__pycache__/
*.py[cod]
.pytest_cache/
backend/.venv/
backend/beetles.db
frontend/node_modules/
frontend/dist/
.env
.env.*
```

### Vite

- 개발 포트 5173
- React plugin 사용
- 임의 proxy는 만들지 않음. API base URL을 직접 사용
- TypeScript strict 활성화

### README

다음을 짧게 포함한다.

- 프로젝트 한 줄 설명
- 데모 계정
- 백엔드 실행 명령
- 프론트엔드 실행 명령
- Chrome 팝업·알림 허용 필요
- 카메라 영상이 서버로 전송되지 않는다는 설명
- 실제 시선 추적이 아닌 양쪽 눈 감김 프로토타입이라는 한계

## 8. 1차 작업 검수

기능 브랜치가 아직 합쳐지지 않았으므로 import 대상이 없을 수 있다. 본인 소유 파일만 확인한다.

```bash
python -m py_compile backend/app/main.py
```

프론트는 의존 기능 브랜치 병합 후 빌드한다. package-lock은 반드시 `npm install`로 생성하고 직접 편집하지 않는다.

## 9. 최종 병합 후 통합 검수

병합 순서에서 API-1 브랜치가 먼저 main에 들어간다. 모든 기능 브랜치가 병합된 후 main 결과를 확인한다.

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m pytest -q

cd ../frontend
npm ci
npm run build
```

오류 처리:

- 공용 타입, API client, `main.py`, build 설정 오류: API-1 브랜치에서 수정 후 main에 추가 병합
- auth 파일 오류: BE-1에게 전달
- session/storage 파일 오류: BE-2에게 전달
- monitoring 파일 오류: FE-2에게 전달
- App/UI 파일 오류: FE-1에게 전달

API-1은 다른 담당 파일을 고쳐 충돌 가능성을 만들지 않는다.

## 10. HTTP smoke test

서버 실행 후:

```bash
curl -s http://localhost:8000/api/health

curl -s -X POST http://localhost:8000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"demo","password":"beetle"}'

curl -s -X POST http://localhost:8000/api/sessions \
  -H 'Authorization: Bearer beetle-demo-token' \
  -H 'Content-Type: application/json' \
  -d '{"duration_seconds":10}'
```

각 응답이 `design.md` 계약과 맞는지 확인한다.

## 11. 최종 개인정보 검수

저장소 전체에서 다음 패턴을 찾는다.

```bash
grep -R "toDataURL\|toBlob\|FormData\|WebSocket" frontend/src backend/app || true
grep -R "landmark\|blink_score\|frame\|image" backend/app || true
```

검색 결과가 있다고 무조건 삭제하지 말고, 영상 또는 생체 특징을 네트워크·DB로 보내는 코드인지 확인한다. 모델 내부 처리를 위한 프론트 코드 사용은 허용한다.

## 12. 완료 조건

- FastAPI와 Vite가 문서의 명령으로 실행된다.
- CORS가 localhost:5173을 허용한다.
- TypeScript 타입과 백엔드 JSON 필드가 일치한다.
- 5개 기능 브랜치 병합 후 pytest와 Vite build가 통과한다.
- 수동 검수 결과와 남은 브라우저 제약을 README에 기록한다.
- API-1 소유 파일 밖의 변경이 없다.

## 13. 완료 커밋

1차:

```bash
git add .gitignore README.md backend/requirements.txt backend/app frontend/package.json frontend/package-lock.json frontend/index.html frontend/tsconfig.json frontend/vite.config.ts frontend/src/main.tsx frontend/src/api frontend/src/contracts
git commit -m "chore: add shared app scaffold and API contract"
```

최종 통합 수정이 있을 때:

```bash
git add <API-1 소유 파일만>
git commit -m "fix(integration): align shared application wiring"
```
