# 비틀비틀 5개 AI 병렬 작업 계획

## 1. 공통 규칙

모든 에이전트는 작업 전에 `design.md`와 자신의 `agent-specs/*.md`를 읽는다. 구현 중 요구사항을 임의로 넓히지 않는다.

- 기준 브랜치: `main`
- 에이전트별 브랜치와 별도 Git worktree에서만 작업한다.
- 다른 에이전트 소유 파일은 수정·이동·포맷하지 않는다.
- 공용 계약의 이름, 경로, API 필드를 변경하지 않는다.
- 의존성이 아직 다른 브랜치에 있어도 임시 사본이나 중복 구현을 만들지 않는다.
- 전체 저장소 포매팅과 자동 수정 명령을 실행하지 않는다.
- `package-lock.json`, 패키지 설정, 루트 파일은 API-1만 수정한다.
- 카메라 영상, 프레임, 랜드마크, blink score를 서버로 보내지 않는다.
- 각 에이전트는 완료 후 자신의 브랜치에 한 개 이상의 커밋을 남긴다.
- **실시간 사람 마스크 실루엣은 필수다.** 전체 카메라 프레임의 흑백·고대비 표시는 완료 폴백으로 인정하지 않는다. 이 항목은 `design.md`의 일반 폴백 설명보다 우선하며 FE-2 상세 명세를 따른다.

## 2. 역할, 브랜치, worktree

| ID | 브랜치 | 권장 worktree | 역할 | 소유 영역 |
|---|---|---|---|---|
| FE-1 | `agent/frontend-ui` | `../beetles-fe-ui` | 화면과 사용자 흐름 | `frontend/src/App.tsx`, `frontend/src/ui/**` |
| FE-2 | `agent/frontend-monitoring` | `../beetles-fe-monitoring` | 카메라·실루엣·눈 감지·경고 창 | `frontend/src/monitoring/**`, `frontend/public/alert.html` |
| BE-1 | `agent/backend-auth` | `../beetles-be-auth` | 데모 로그인과 인증 의존성 | `backend/app/routers/auth.py`, `backend/app/core/security.py`, `backend/tests/test_auth.py` |
| BE-2 | `agent/backend-session` | `../beetles-be-session` | SQLite와 세션 API | `backend/app/routers/sessions.py`, `backend/app/storage/sqlite.py`, `backend/tests/test_sessions.py` |
| API-1 | `agent/api-integration` | `../beetles-api-integration` | 프로젝트 골격·API 클라이언트·통합 검수 | 루트 설정, 빌드 설정, `main.py`, `main.tsx`, `frontend/src/api/**`, `frontend/src/contracts/**` |

상세 구현은 `agent-specs/01`부터 `05`까지를 따른다.

## 3. 30분 타임박스

### 0~3분: 병합 담당자가 worktree 준비

5개 에이전트를 실행하기 전에 병합 담당자 한 명이 main 작업 디렉터리에서 아래 명령을 한 번만 실행한다. 모든 브랜치는 동일한 명세 커밋에서 생성한다.

```bash
git switch main
git pull --ff-only

git worktree add ../beetles-fe-ui -b agent/frontend-ui main
git worktree add ../beetles-fe-monitoring -b agent/frontend-monitoring main
git worktree add ../beetles-be-auth -b agent/backend-auth main
git worktree add ../beetles-be-session -b agent/backend-session main
git worktree add ../beetles-api-integration -b agent/api-integration main
```

각 에이전트에는 자신의 worktree 절대 경로만 작업 디렉터리로 전달한다. 같은 디렉터리에서 여러 에이전트가 `git switch`를 실행하면 안 된다. 에이전트는 작업 중 `main`을 pull, merge, rebase하지 않는다.

### 3~20분: 병렬 구현

- FE-1: 로그인 → 로비 → 시간 설정 → 집중 화면과 타이머
- FE-2: 카메라 → ImageSegmenter 사람 마스크 → 눈 감김 → 보조 경고 창
- BE-1: 데모 로그인과 Bearer 토큰 검사
- BE-2: SQLite 세션 저장과 상태 전이 API
- API-1: React/FastAPI 골격, 계약 타입, API 클라이언트, CORS, 실행 문서

### 20~24분: 담당 영역 자체 검수

각 에이전트는 자신의 명세에 적힌 검수 명령을 실행한다. 실패를 숨기지 말고 전달 메모에 남긴다.

### 24분: 코드 동결

- 신규 기능 추가를 중단한다.
- 담당 파일만 커밋한다.
- 미완료 사항을 기록한다.
- 기능 브랜치에서 main을 역병합하지 않는다.

### 24~27분: main 병합

한 명의 병합 담당자만 원래 main worktree에서 아래 순서로 병합한다.

```bash
git switch main
git merge --no-ff agent/api-integration
git merge --no-ff agent/backend-auth
git merge --no-ff agent/backend-session
git merge --no-ff agent/frontend-monitoring
git merge --no-ff agent/frontend-ui
```

골격과 공용 계약을 먼저 설치하고 기능 모듈을 넣은 뒤 UI를 연결하는 순서다.

### 27~30분: 통합 검수

API-1이 main 결과를 검수한다. API-1 소유 파일 수정이 필요하면 API worktree에서 `main`을 merge하고 수정 커밋을 만든다. 병합 담당자가 그 커밋을 main에 추가 병합한다. 다른 담당자 파일의 오류는 해당 소유자가 같은 방식으로 수정한다.

## 4. 충돌 방지 규칙

### 4.1 절대 규칙

1. 파일 소유자는 정확히 한 명이다.
2. import 대상이 아직 없어도 다른 담당자 경로에 임시 파일을 만들지 않는다.
3. 공통 타입을 각 모듈에 복사하지 않는다.
4. 패키지 추가가 필요하면 API-1에게 전달한다. 다른 담당자는 dependency 파일과 lockfile을 수정하지 않는다.
5. 폴더 전체에 포매터를 실행하지 않는다.
6. 생성 파일, DB, 가상환경, `node_modules`를 커밋하지 않는다.

### 4.2 예상 의존성

- FE-1은 FE-2의 `EyeMonitorProvider`, `useEyeMonitor`, `SilhouetteCanvas`가 존재한다고 가정한다.
- FE-1은 API-1의 `apiClient`와 계약 타입이 존재한다고 가정한다.
- BE-2는 BE-1의 `require_demo_user`가 존재한다고 가정한다.
- API-1의 `main.py`는 BE-1과 BE-2의 `router`를 import한다.
- API-1의 `main.tsx`는 FE-2 Provider와 FE-1 App을 import한다.

각 기능 브랜치가 단독으로 빌드되지 않는 것은 허용한다. 최종 main은 반드시 빌드되어야 한다.

### 4.3 충돌 발생 시 실행 절차

main에서 merge conflict가 발생하면 진행 중인 병합을 유지한 채 다른 merge를 실행하지 않는다.

```bash
git merge --abort
```

그 다음:

1. `git diff main...<branch> --name-only`로 소유권 침범을 찾는다.
2. 침범 파일이 있으면 해당 브랜치 담당자가 자신의 소유 파일만 남기는 수정 커밋을 만든다.
3. 정당한 충돌이면 파일 소유자의 worktree에서 `git merge main`을 실행한다.
4. 소유자가 그 worktree에서 충돌을 해결하고 커밋한다.
5. 병합 담당자가 main에서 해당 브랜치를 다시 병합한다.
6. `ours` 또는 `theirs` 일괄 선택은 금지한다.

소유권대로 작업했다면 동일 파일 충돌은 발생하지 않아야 한다.

## 5. 에이전트별 완료 산출물

### FE-1

- 데모 로그인 UI
- 서비스 설명과 개인정보 안내가 있는 로비
- 시·분·초 화살표 시간 설정
- 집중 타이머, 일시정지, 재개, 종료
- 경고 오버레이와 세션 종료 화면

### FE-2

- 사용자 동작 기반 카메라 권한 요청
- ImageSegmenter 사람 마스크 기반 실시간 실루엣과 눈 윤곽 canvas
- 양쪽 눈 7초 감김 감지
- 사전 개방 보조 창과 `postMessage` 경고
- 눈 복귀 0.5초 내 경고 해제
- 카메라·타이머·창 자원 해제

### BE-1

- `demo / beetle` 로그인
- 고정 데모 Bearer 토큰 발급
- 보호 API에서 토큰 검증
- 인증 성공·실패 테스트

### BE-2

- 단일 SQLite 테이블 자동 생성
- 세션 시작·일시정지·재개·경고·종료 API
- 상태 전이와 입력 범위 검증
- 세션 API 테스트

### API-1

- 실행 가능한 Vite와 FastAPI 골격
- 정확한 TypeScript API 계약과 fetch 클라이언트
- CORS 및 라우터 연결
- 의존성 파일과 `.gitignore`
- 최종 빌드·테스트·수동 시나리오 검수

## 6. 최종 자동 검수

```bash
cd backend
python -m pytest -q

cd ../frontend
npm ci
npm run build
```

확인 사항:

- Python import 오류가 없다.
- API 테스트가 모두 통과한다.
- TypeScript와 Vite 빌드 오류가 없다.
- 브랜치가 소유하지 않은 파일을 수정하지 않았다.

브랜치별 소유권 확인 예시:

```bash
git diff --name-only main...agent/frontend-ui
```

## 7. 최종 수동 검수

Chrome 최신 버전에서 팝업과 알림을 허용하고 다음을 확인한다.

1. `demo / wrong` 로그인 실패
2. `demo / beetle` 로그인 성공
3. 로비에서 카메라 권한 허용
4. 배경이 제거된 사람 마스크 실루엣과 눈 윤곽 표시
5. 10초 이상 시간 설정
6. 집중 시작 시 보조 창 생성
7. 일시정지 동안 남은 시간 고정
8. 재개 후 남은 시간 감소
9. 다른 탭으로 이동한 뒤 양쪽 눈을 7초 감기
10. 보조 창 깜빡임 또는 대체 알림
11. 눈을 뜬 뒤 0.5초 안에 경고 해제
12. 자동 종료 후 카메라 표시등과 보조 창 종료
13. SQLite에 세션 요약만 저장

## 8. 완료 판정

- **필수 통과:** 로그인, 카메라, ImageSegmenter 사람 마스크 실루엣, 눈 윤곽, 눈 감김 7초 경고, 0.5초 내 복귀 해제, 타이머, 일시정지, 자동 종료, 세션 저장
- **허용 가능한 폴백:** 창 포커스 실패 시 Notification과 인앱 오버레이. 사람 마스크에는 폴백을 허용하지 않는다.
- **실패 판정:** 전체 카메라 프레임을 실루엣 대신 표시, 원본 영상 또는 생체 특징 서버 전송, 팝업 차단 우회 시도, 담당 경로 침범, 최종 빌드 실패
