# 비틀비틀 30분 프로토타입 설계

## 1. 목적과 문서 우선순위

이 문서는 5개의 AI 에이전트가 30분 안에 충돌 없이 프로토타입을 구현하기 위한 기준 설계다. 기존 `requirements.md`는 장기 제품 요구사항으로 남겨 두되, 이번 프로토타입에서는 이 문서와 `tasks.md`, `agent-specs/*.md`가 우선한다.

확정 범위:

- 프로젝트명: **비틀비틀**
- 프론트엔드: React + TypeScript + Vite
- 백엔드: Python + FastAPI
- 인증: 회원가입 없는 데모 로그인
- 감지: 실제 시선 방향이 아닌 **양쪽 눈 감김만** 감지
- 경고: 양쪽 눈 감김이 연속 7초 이상일 때 시작
- 복귀: 경고 중 눈이 열리면 최대 0.5초 안에 경고 해제
- 영상 처리: 브라우저 안에서만 수행. 영상과 생체 특징은 서버 전송·저장 금지
- 데이터 저장: Python 내장 `sqlite3`로 세션 요약만 저장
- 시연 대상: 최신 데스크톱 Chrome, `localhost` 또는 HTTPS

## 2. 사용자 흐름

1. 사용자는 `/`에서 데모 계정 `demo / beetle`로 로그인한다.
2. 로비에서 서비스 설명과 개인정보 안내를 확인한다.
3. 사용자가 버튼을 눌러 카메라 권한을 허용하면 로비에서 실시간 사람 실루엣과 눈 윤곽을 본다.
4. 시간 설정 화면에서 시·분·초를 위/아래 화살표로 설정한다. 허용 범위는 10초~4시간이다.
5. `집중 시작` 클릭 이벤트 안에서 경고용 보조 창을 미리 열고, 세션 API와 눈 감지를 시작한다.
6. 사용자는 다른 브라우저 탭이나 애플리케이션에서 본인 작업을 한다.
7. 양쪽 눈이 7초 연속 감기면 보조 창이 강한 색으로 깜빡이고 브라우저 알림을 함께 시도한다.
8. 경고 중 최대 500ms 간격으로 눈 상태를 계속 확인한다. 눈이 열리면 경고를 해제한다.
9. 사용자는 세션을 일시정지·재개하거나 수동 종료할 수 있다.
10. 설정한 시간이 끝나면 자동 종료하고 카메라와 보조 창을 해제한다.

## 3. 브라우저 제약과 경고 창 방식

브라우저는 사용자 클릭과 무관한 시점의 `window.open()`과 임의 포커스 이동을 차단한다. 집중 이탈 시점에 새 창을 처음 여는 방식은 보장할 수 없다.

프로토타입은 다음 방식으로 구현한다.

- `집중 시작` 클릭 핸들러의 첫 동기 작업으로 `window.open('/alert.html', 'beetle-alert', ...)`을 호출한다.
- 보조 창은 평상시 `집중 감지 중` 대기 화면을 표시한다.
- 경고 발생 시 같은 origin의 `postMessage`로 `WARNING`을 보내고 `popup.focus()`를 시도한다.
- 눈이 열리면 `RECOVERED`를 보내 깜빡임을 즉시 중단한다.
- 세션 종료 시 `SESSION_END`를 보낸 뒤 창을 닫는다.
- 보조 창이 닫혔거나 포커스 이동이 차단되면 Notification API와 원래 화면의 전체 화면 오버레이를 사용한다.

운영체제와 브라우저 설정 때문에 창을 화면 앞으로 가져오는 동작은 100% 보장할 수 없다. Chrome에서 해당 사이트의 팝업과 알림을 허용한 상태를 시연 조건으로 한다.

백그라운드 탭의 timer는 지연될 수 있다. 남은 시간과 눈 감김 시간은 interval 횟수로 계산하지 않고 `Date.now()` 또는 `performance.now()`의 실제 시각 차이로 계산한다. Page Visibility 변경만으로 감지를 중단하지 않는다.

## 4. 프로토타입 제외 범위

- 회원가입, 비밀번호 변경, OAuth, 실제 사용자 DB
- 실제 시선 방향, 응시 지점, 얼굴 이탈 판정
- 모든 브라우저·모바일 완전 지원
- 클라우드 배포, 운영 HTTPS, 운영 보안
- 세션 목록과 통계 화면
- 모델 학습, 사용자별 보정, 정확도 튜닝
- 운영 수준 토큰 만료·재발급

## 5. 고정 디렉터리와 파일 소유권

괄호 안 담당자만 해당 경로를 수정한다.

```text
beetles/
├── .gitignore                                      (API-1)
├── README.md                                       (API-1)
├── backend/
│   ├── requirements.txt                            (API-1)
│   ├── app/
│   │   ├── __init__.py                             (API-1)
│   │   ├── main.py                                 (API-1)
│   │   ├── routers/
│   │   │   ├── __init__.py                         (API-1)
│   │   │   ├── auth.py                             (BE-1)
│   │   │   └── sessions.py                         (BE-2)
│   │   ├── core/
│   │   │   ├── __init__.py                         (API-1)
│   │   │   └── security.py                         (BE-1)
│   │   └── storage/
│   │       ├── __init__.py                         (API-1)
│   │       └── sqlite.py                           (BE-2)
│   └── tests/
│       ├── test_auth.py                            (BE-1)
│       └── test_sessions.py                        (BE-2)
├── frontend/
│   ├── package.json                                (API-1)
│   ├── package-lock.json                           (API-1)
│   ├── index.html                                  (API-1)
│   ├── tsconfig.json                               (API-1)
│   ├── vite.config.ts                              (API-1)
│   ├── public/
│   │   └── alert.html                              (FE-2)
│   └── src/
│       ├── main.tsx                                (API-1)
│       ├── App.tsx                                 (FE-1)
│       ├── api/client.ts                           (API-1)
│       ├── contracts/api.ts                        (API-1)
│       ├── monitoring/
│       │   ├── EyeMonitorContext.tsx               (FE-2)
│       │   ├── SilhouetteCanvas.tsx                (FE-2)
│       │   └── monitoring.css                      (FE-2)
│       └── ui/
│           ├── LoginPage.tsx                       (FE-1)
│           ├── LobbyPage.tsx                       (FE-1)
│           ├── SetupPage.tsx                       (FE-1)
│           ├── FocusPage.tsx                       (FE-1)
│           ├── DurationPicker.tsx                  (FE-1)
│           └── app.css                             (FE-1)
└── .kiro/specs/focus-monitoring-web-app/
    ├── requirements.md                             (기존 장기 문서, 구현 중 수정 금지)
    ├── design.md                                   (기준 문서, 구현 중 수정 금지)
    ├── tasks.md                                    (기준 문서, 구현 중 수정 금지)
    └── agent-specs/
        ├── 01-frontend-ui.md
        ├── 02-frontend-monitoring.md
        ├── 03-backend-auth.md
        ├── 04-backend-session.md
        └── 05-api-integration.md
```

## 6. 고정 프론트엔드 계약

### 6.1 모니터링 Context

FE-2는 아래 이름을 정확히 제공하고 FE-1은 이 이름만 사용한다.

```ts
export type MonitorPhase =
  | 'idle'
  | 'requesting'
  | 'ready'
  | 'running'
  | 'paused'
  | 'error';

export interface MonitorSnapshot {
  phase: MonitorPhase;
  faceDetected: boolean;
  bothEyesClosed: boolean;
  leftBlinkScore: number;
  rightBlinkScore: number;
  closedForMs: number;
  warningActive: boolean;
  errorMessage: string | null;
}

export interface EyeMonitorController extends MonitorSnapshot {
  prepareCamera(): Promise<void>;
  openAlertWindow(): Window | null;
  startDetection(): Promise<void>;
  pauseDetection(): void;
  resumeDetection(): void;
  stopDetection(): void;
}

export function EyeMonitorProvider(props: { children: React.ReactNode }): JSX.Element;
export function useEyeMonitor(): EyeMonitorController;
export { SilhouetteCanvas } from './SilhouetteCanvas';
```

API-1의 `main.tsx`가 `EyeMonitorProvider`로 FE-1의 `App`을 감싼다.

### 6.2 눈 감김 기준

- MediaPipe Face Landmarker의 `eyeBlinkLeft`, `eyeBlinkRight` blendshape를 사용한다.
- 두 점수가 모두 0.55 이상일 때만 `bothEyesClosed = true`다.
- 얼굴을 찾지 못한 구간은 눈 감김으로 판정하지 않는다.
- 열린 눈 프레임이 확인되면 연속 눈 감김 시작 시각을 즉시 초기화한다.
- 연속 7,000ms에 도달하면 경고 에피소드를 한 번 시작한다.
- 경고 상태에서도 500ms 이하 간격을 목표로 분석한다.
- 눈이 열리면 경고를 해제한다. 다시 감기면 7초를 처음부터 계산한다.

### 6.3 실루엣 표시

- 원본 `<video>`는 사용자에게 직접 노출하지 않는다.
- 카메라 프레임은 `<canvas>`에 표시한다.
- 가능하면 MediaPipe Image Segmenter로 사람 마스크를 만들고 배경과 사람을 각각 단색으로 표시한다.
- 얼굴 랜드마크에서 양쪽 눈 윤곽을 대비되는 색 선으로 그린다.
- segmentation 모델이 실패하면 흑백 고대비 프레임과 눈 윤곽 표시로 폴백한다.
- 영상, 프레임, landmark, blink score는 네트워크로 보내지 않는다.

### 6.4 UI 상태

FE-1은 라우터 라이브러리 없이 다음 상태로 화면을 전환한다.

```ts
type Screen = 'login' | 'lobby' | 'setup' | 'focus' | 'finished';
```

인증 토큰은 메모리에만 둔다. 새로고침하면 로그인 화면으로 돌아간다.

## 7. 고정 HTTP API 계약

기본 URL은 `http://localhost:8000/api`다. 모든 응답은 JSON이고 시간은 UTC ISO 8601 문자열이다.

### 7.1 헬스 체크

```http
GET /api/health
200 {"status":"ok"}
```

### 7.2 데모 로그인

```http
POST /api/auth/login
Content-Type: application/json

{"username":"demo","password":"beetle"}
```

성공 200:

```json
{
  "access_token": "beetle-demo-token",
  "token_type": "bearer",
  "user": {"id": "demo-user", "display_name": "Demo User"}
}
```

실패 401:

```json
{"detail":"Invalid demo credentials"}
```

보호 API는 다음 헤더를 사용한다.

```http
Authorization: Bearer beetle-demo-token
```

토큰 누락 또는 불일치는 401 `{"detail":"Not authenticated"}`다.

### 7.3 세션 시작

```http
POST /api/sessions
Authorization: Bearer beetle-demo-token
Content-Type: application/json

{"duration_seconds":1500}
```

`duration_seconds`는 10~14,400 정수다. 성공은 201과 다음 객체를 반환한다.

```json
{
  "id": "uuid",
  "user_id": "demo-user",
  "duration_seconds": 1500,
  "status": "active",
  "started_at": "2025-01-01T00:00:00Z",
  "ended_at": null,
  "total_paused_seconds": 0,
  "warning_count": 0
}
```

### 7.4 일시정지와 재개

```http
POST /api/sessions/{session_id}/pause
POST /api/sessions/{session_id}/resume
```

성공 200은 최신 세션 객체를 반환한다. 잘못된 상태 전이는 409다.

### 7.5 눈 감김 경고 기록

```http
POST /api/sessions/{session_id}/warnings
Content-Type: application/json

{"type":"eyes_closed"}
```

성공 200은 증가된 `warning_count`를 포함한다. FE-1은 `warningActive`가 `false → true`일 때 한 번만 호출한다.

### 7.6 세션 종료

```http
POST /api/sessions/{session_id}/finish
Content-Type: application/json

{"reason":"completed"}
```

`reason`은 `completed | manual | logout | error`다. 성공 시 `ended_at`이 채워지고 상태는 `completed` 또는 `stopped`다.

### 7.7 오류 형식

FastAPI 기본 오류 형식을 사용한다.

```json
{"detail":"설명"}
```

## 8. SQLite 계약

DB 파일은 `backend/beetles.db`이며 Git에 커밋하지 않는다. 테이블은 하나만 사용한다.

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

카메라 영상, 프레임, 이미지, landmark, blink score 컬럼과 API 필드는 금지한다.

## 9. 고정 실행 계약

```bash
# 백엔드
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# 프론트엔드
cd frontend
npm install
npm run dev
```

백엔드는 `http://localhost:8000`, 프론트엔드는 `http://localhost:5173`을 사용한다.

## 10. 역할 요약

- FE-1: 화면, 사용자 흐름, 실제 시각 기반 집중 타이머
- FE-2: 카메라, 실루엣, 눈 감김, 보조 경고 창
- BE-1: 데모 로그인, Bearer 토큰 검사
- BE-2: SQLite 세션 수명주기
- API-1: 공용 골격, 계약 타입, API client, CORS, 최종 통합

## 11. 프로토타입 완료 기준

1. 잘못된 로그인은 실패하고 `demo / beetle`은 성공한다.
2. 버튼으로 카메라를 허용한 뒤 로비에 실루엣과 눈 윤곽이 보인다.
3. 10초~4시간을 화살표로 설정할 수 있다.
4. 타이머가 실제 경과 시간을 기준으로 줄어든다.
5. 일시정지 중 타이머와 눈 감김 누적이 멈추고 재개할 수 있다.
6. 양쪽 눈을 7초 감으면 보조 창 또는 대체 경고가 동작한다.
7. 눈을 뜨면 0.5초 안에 깜빡임이 멈춘다.
8. Chrome 시연 환경에서 다른 탭을 보고 있어도 감지가 이어진다.
9. 설정 시간이 끝나면 카메라 트랙과 경고 창이 종료된다.
10. SQLite에는 세션 요약만 남고 영상 관련 데이터가 없다.
