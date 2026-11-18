# FE-1 작업 명세: 프론트엔드 UI와 세션 흐름

## 1. 목표

사용자가 데모 로그인 후 서비스 설명을 확인하고, 카메라 실루엣을 보며 시간을 설정한 뒤 집중 세션을 시작·일시정지·재개·종료할 수 있는 React UI를 구현한다.

## 2. 브랜치와 소유 파일

- 브랜치: `agent/frontend-ui`
- 역할 ID: `FE-1`
- 수정 가능:
  - `frontend/src/App.tsx`
  - `frontend/src/ui/LoginPage.tsx`
  - `frontend/src/ui/LobbyPage.tsx`
  - `frontend/src/ui/SetupPage.tsx`
  - `frontend/src/ui/FocusPage.tsx`
  - `frontend/src/ui/DurationPicker.tsx`
  - `frontend/src/ui/app.css`
- 수정 금지: 위 목록 외 모든 파일

의존 파일이 아직 없어도 stub, 복사본, 임시 `package.json`을 만들지 않는다. `design.md`에 적힌 export가 최종 병합 후 존재한다고 가정한다.

## 3. 사용할 외부 계약

```ts
import {
  useEyeMonitor,
  SilhouetteCanvas,
} from './monitoring/EyeMonitorContext';

import { apiClient, ApiError } from './api/client';
import type { AuthResponse, SessionRecord, FinishReason } from './contracts/api';
```

FE-2가 `SilhouetteCanvas`를 별도 파일에서 구현하더라도 `EyeMonitorContext.tsx`가 이를 재-export해야 한다. FE-1은 위 import 경로를 바꾸지 않는다.

`apiClient`의 고정 메서드:

```ts
apiClient.login(username, password): Promise<AuthResponse>
apiClient.startSession(token, durationSeconds): Promise<SessionRecord>
apiClient.pauseSession(token, sessionId): Promise<SessionRecord>
apiClient.resumeSession(token, sessionId): Promise<SessionRecord>
apiClient.recordWarning(token, sessionId): Promise<SessionRecord>
apiClient.finishSession(token, sessionId, reason): Promise<SessionRecord>
```

## 4. 화면 상태

`App.tsx`에서 라우터 없이 다음 상태를 관리한다.

```ts
type Screen = 'login' | 'lobby' | 'setup' | 'focus' | 'finished';
```

최소 상태:

```ts
const [screen, setScreen] = useState<Screen>('login');
const [token, setToken] = useState<string | null>(null);
const [durationSeconds, setDurationSeconds] = useState(25 * 60);
const [session, setSession] = useState<SessionRecord | null>(null);
const [remainingMs, setRemainingMs] = useState(durationSeconds * 1000);
const [error, setError] = useState<string | null>(null);
```

토큰과 세션은 메모리에만 둔다. localStorage를 사용하지 않는다.

## 5. 구현 요구사항

### 5.1 로그인 화면

- 프로젝트명 `비틀비틀`을 가장 먼저 표시한다.
- 사용자명과 비밀번호 필드를 제공한다.
- 데모 안내 `아이디 demo / 비밀번호 beetle`을 표시한다.
- submit 시 `apiClient.login`을 호출한다.
- 성공 시 토큰을 저장하고 `lobby`로 이동한다.
- 401 또는 네트워크 오류는 입력 폼 아래 텍스트로 표시한다.
- 중복 제출을 막기 위해 요청 중 버튼을 비활성화한다.

### 5.2 로비 화면

다음 내용을 짧게 보여준다.

- 서비스 설명: `눈 감김을 감지해 집중 복귀를 돕는 브라우저 집중 모드`
- 영상은 브라우저 안에서만 처리되고 저장·전송되지 않는다는 안내
- Chrome에서 팝업과 알림 권한이 필요하다는 안내
- `카메라 미리보기` 버튼
- `시간 설정으로 이동` 버튼
- `SilhouetteCanvas`

`카메라 미리보기` 클릭 시 `monitor.prepareCamera()`를 호출한다. 권한 오류는 눈에 보이는 텍스트로 출력한다. 카메라 권한 요청을 페이지 진입과 동시에 실행하지 않는다.

### 5.3 시간 설정 화면

- `DurationPicker`를 표시한다.
- `SilhouetteCanvas`를 계속 표시한다.
- `로비로`와 `집중 시작` 버튼을 제공한다.
- 카메라가 준비되지 않았다면 시작 과정에서 준비를 요청한다.

`DurationPicker` 계약:

```ts
interface DurationPickerProps {
  valueSeconds: number;
  onChange(nextSeconds: number): void;
}
```

- 시·분·초 세 열을 사용한다.
- 각 열에 위 화살표와 아래 화살표 버튼을 둔다.
- 시는 1시간, 분은 1분, 초는 10초 단위로 증감한다.
- 최종 총시간을 10~14,400초로 clamp한다.
- 현재 총시간을 `HH:MM:SS`로 표시한다.
- 키보드로 모든 버튼을 조작할 수 있어야 한다.

### 5.4 집중 시작 순서

팝업 차단을 피하기 위해 시작 버튼 핸들러에서 아래 순서를 지킨다.

```ts
async function handleStart() {
  monitor.openAlertWindow(); // await보다 먼저, 첫 동기 작업으로 실행
  // 그 다음 API 및 카메라 비동기 작업
}
```

전체 순서:

1. `monitor.openAlertWindow()`를 동기 호출한다.
2. 카메라가 준비되지 않았다면 `monitor.prepareCamera()`를 await한다.
3. `apiClient.startSession(token, durationSeconds)`를 호출한다.
4. 세션 객체와 남은 시간을 저장한다.
5. `monitor.startDetection()`을 호출한다.
6. `focus` 화면으로 이동한다.

실패하면 `monitor.stopDetection()`을 호출하고 오류를 표시한다. 세션 생성 후 감지 시작이 실패했다면 `finishSession(..., 'error')`를 best effort로 호출한다.

### 5.5 집중 화면

다음을 표시한다.

- `SilhouetteCanvas`
- 남은 시간 `HH:MM:SS`
- 카메라/감지 상태 텍스트
- 눈 감김 지속 시간(초, 소수점 한 자리)
- `일시정지` 또는 `재개` 버튼
- `집중 종료` 버튼
- 경고 중 전체 화면 고대비 오버레이 `눈을 뜨고 다시 집중하세요`

카메라 상태를 색상만으로 표현하지 않는다.

### 5.6 타이머

백그라운드 타이머 throttling에 대응하기 위해 매 틱마다 1초를 빼는 방식을 사용하지 않는다.

- 시작 시 `deadline = Date.now() + durationSeconds * 1000`
- 실행 중 250ms 간격으로 `Math.max(0, deadline - Date.now())` 계산
- 일시정지 시 현재 `remainingMs`를 고정하고 interval 해제
- 재개 시 `deadline = Date.now() + remainingMs`
- 0 도달 시 한 번만 자동 완료 처리

React Strict Mode의 effect 중복 실행에도 종료 API가 두 번 호출되지 않도록 `useRef` 플래그를 사용한다.

### 5.7 일시정지·재개

일시정지:

1. 프론트 타이머를 멈춘다.
2. `monitor.pauseDetection()`을 호출한다.
3. `apiClient.pauseSession`을 호출한다.

재개:

1. `apiClient.resumeSession`을 호출한다.
2. 새 deadline을 계산한다.
3. `monitor.resumeDetection()`을 호출한다.

API 오류 시 화면에 동기화 실패를 표시하되 UI가 멈춰 조작 불가능한 상태가 되지 않게 한다.

### 5.8 경고 기록

`monitor.warningActive`의 이전 값을 ref에 저장한다. `false → true` 변화에서만 `apiClient.recordWarning`을 한 번 호출한다. 경고가 유지되는 동안 반복 호출하지 않는다.

### 5.9 종료

자동 종료는 reason `completed`, 사용자 종료는 `manual`, 로그인 화면 복귀는 `logout`, 치명적 오류는 `error`를 사용한다.

종료 순서:

1. 중복 종료 방지 플래그 확인
2. 타이머 중지
3. `monitor.stopDetection()` 호출
4. `apiClient.finishSession` 호출
5. `finished` 화면으로 이동

종료 API가 실패해도 카메라는 먼저 해제하고 종료 화면을 표시한다.

## 6. UI 기준

- 한 화면의 주 행동 버튼은 하나만 강하게 강조한다.
- 배경은 짙은 남색 계열, 실루엣은 밝은 청록 또는 흰색, 경고는 주황·빨강 계열을 사용한다.
- 본문 글자 대비는 최소 4.5:1을 목표로 한다.
- `:focus-visible` 테두리를 반드시 제공한다.
- 모바일 완성도보다 1280×720 데스크톱 시연을 우선한다.
- CSS 애니메이션은 경고 오버레이 외에는 최소화한다.
- `prefers-reduced-motion`에서는 깜빡임 대신 고정 빨간 테두리를 표시한다.

## 7. 구현하지 않을 것

- React Router, 전역 상태 라이브러리
- 회원가입과 세션 기록 목록
- 시선 방향 또는 얼굴 이탈 판정
- 영상 업로드
- UI 컴포넌트 라이브러리 추가

## 8. 자체 검수

최종 병합 전에는 API-1의 설정 파일과 FE-2 모듈이 없을 수 있으므로 소유 파일의 타입 이름과 import 경로를 먼저 대조한다. 통합 후 다음을 실행한다.

```bash
cd frontend
npm run build
```

수동 확인:

- `demo / beetle`로 로그인할 수 있다.
- 로비, 설정, 집중, 완료 화면 흐름이 끊기지 않는다.
- 시간은 10~14,400초를 벗어나지 않는다.
- 시작 핸들러에서 팝업 함수가 첫 await보다 먼저 호출된다.
- 일시정지 중 남은 시간이 줄지 않는다.
- 경고 에피소드당 API 기록이 한 번이다.
- 종료 시 카메라 해제가 API 성공 여부보다 우선한다.

## 9. 완료 커밋

```bash
git add frontend/src/App.tsx frontend/src/ui
git commit -m "feat(frontend): add prototype user flow and focus timer"
```
