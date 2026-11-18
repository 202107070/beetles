# FE-2 작업 명세: 카메라, 실루엣, 눈 감지, 경고 창

## 1. 목표

브라우저 카메라 영상을 외부로 전송하지 않고 기기 안에서 처리하여 사람 실루엣과 눈 윤곽을 표시한다. 양쪽 눈이 연속 7초 감긴 경우 미리 열린 보조 창과 대체 수단으로 경고하고, 눈이 열리면 0.5초 안에 경고를 해제한다.

## 2. 브랜치와 소유 파일

- 브랜치: `agent/frontend-monitoring`
- 역할 ID: `FE-2`
- 수정 가능:
  - `frontend/src/monitoring/EyeMonitorContext.tsx`
  - `frontend/src/monitoring/SilhouetteCanvas.tsx`
  - `frontend/src/monitoring/monitoring.css`
  - `frontend/public/alert.html`
- 수정 금지: 위 목록 외 모든 파일

`package.json`과 lockfile을 수정하지 않는다. API-1이 `@mediapipe/tasks-vision` 의존성을 제공한다.

## 3. 외부 export 계약

`EyeMonitorContext.tsx`에서 아래 이름을 정확히 export한다.

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

Provider 밖에서 `useEyeMonitor`를 호출하면 명확한 Error를 throw한다.

## 4. 내부 구조

Provider가 다음 ref를 소유한다.

- 사용자에게 노출하지 않는 `<video>` element
- 출력용 canvas element 또는 canvas 등록 함수
- `MediaStream`
- FaceLandmarker 인스턴스
- 선택적 ImageSegmenter 인스턴스
- 분석 interval ID
- 눈 감김 시작 시각
- 경고 에피소드 활성 여부
- `Window | null` 보조 창 참조
- mounted 여부와 초기화 중 Promise

React state에는 `MonitorSnapshot`만 둔다. 프레임별 큰 객체와 랜드마크 배열은 state에 넣지 않는다.

## 5. 카메라 준비

`prepareCamera()`는 다음을 수행한다.

1. 이미 준비되었으면 같은 스트림을 재사용한다.
2. phase를 `requesting`으로 바꾼다.
3. 아래 제약으로 한 번만 `getUserMedia`를 요청한다.

```ts
navigator.mediaDevices.getUserMedia({
  video: {
    facingMode: 'user',
    width: { ideal: 640 },
    height: { ideal: 480 },
    frameRate: { ideal: 15, max: 30 },
  },
  audio: false,
});
```

4. 숨겨진 video에 stream을 연결하고 `playsInline`, `muted`, autoplay 조건을 설정한다.
5. `video.play()`와 metadata 준비를 기다린다.
6. 모델을 초기화한다.
7. 미리보기 렌더 루프를 시작하고 phase를 `ready`로 바꾼다.

권한 거부, 장치 없음, 모델 실패는 사람이 이해할 수 있는 한국어 `errorMessage`로 변환한다. 동일 요청 중복 호출은 같은 Promise를 반환한다.

## 6. MediaPipe 모델

`@mediapipe/tasks-vision`의 FaceLandmarker와 ImageSegmenter를 모두 필수로 사용한다. 두 모델 중 하나라도 준비되지 않으면 phase를 `error`로 바꾸고 세션 시작을 허용하지 않는다. 전체 카메라 프레임을 흑백으로 보여주는 폴백은 사용하지 않는다.

고정 자산:

```text
WASM_ROOT=https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm
FACE_MODEL=https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task
SEGMENT_MODEL=https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite
```

FaceLandmarker 설정:

```ts
{
  baseOptions: { modelAssetPath: FACE_MODEL },
  runningMode: 'VIDEO',
  numFaces: 1,
  outputFaceBlendshapes: true,
  minFaceDetectionConfidence: 0.5,
  minFacePresenceConfidence: 0.5,
  minTrackingConfidence: 0.5,
}
```

ImageSegmenter 설정:

```ts
{
  baseOptions: { modelAssetPath: SEGMENT_MODEL },
  runningMode: 'VIDEO',
  outputCategoryMask: true,
  outputConfidenceMasks: false,
}
```

ImageSegmenter의 category mask에서 사람 범주 픽셀만 실루엣으로 그린다. 모델 파일 다운로드 외에 카메라 데이터가 네트워크로 나가면 안 된다.

## 7. 눈 감김 판정

각 분석 시각에는 `performance.now()`를 사용한다.

1. `detectForVideo(video, now)`를 호출한다.
2. 얼굴 결과가 정확히 하나가 아니면 `faceDetected=false`, `bothEyesClosed=false`, `closedForMs=0`으로 만든다.
3. blendshape 카테고리에서 `eyeBlinkLeft`, `eyeBlinkRight` 점수를 이름으로 찾는다.
4. 두 점수가 모두 0.55 이상이면 양쪽 눈 감김이다.
5. 첫 양쪽 눈 감김 시각을 ref에 저장한다.
6. 계속 감겨 있으면 `closedForMs = now - closedStartedAt`으로 계산한다.
7. 7,000ms 이상이고 현재 에피소드 경고를 보내지 않았다면 `warningActive=true`로 바꾸고 경고를 전송한다.
8. 얼굴이 보이는 열린 눈 프레임이 들어오면 시작 시각을 지우고 `closedForMs=0`으로 만든다. 경고 중이었다면 즉시 경고를 해제한다.

얼굴 미감지는 집중 이탈 경고로 사용하지 않는다. 실제 시선 방향도 계산하지 않는다.

분석 주기:

- running 상태: `setInterval` 250ms를 목표로 한다.
- warning 상태: 500ms보다 긴 간격이 생기지 않도록 같은 250ms interval을 유지한다.
- 프레임 처리가 진행 중이면 다음 틱을 건너뛰어 중첩 추론을 막는다.
- elapsed time은 interval 횟수가 아닌 실제 시각 차이로 계산한다.

브라우저가 백그라운드 타이머를 지연할 수 있다는 사실은 숨기지 않는다. Chrome 데스크톱 시연을 우선하며 Page Visibility 변경 시 분석을 의도적으로 중단하지 않는다.

## 8. 실루엣 canvas

`SilhouetteCanvas`는 Provider의 처리 결과를 표시하는 canvas를 렌더링한다.

- 기본 크기: 내부 640×480, CSS로 반응형 표시
- 좌우 반전하여 거울처럼 표시
- 매 렌더 프레임에 ImageSegmenter category mask를 적용
- 사람 mask 내부는 밝은 단색, mask 바깥은 짙은 단색으로 표시
- 원본 카메라 배경이나 전체 고대비 프레임을 사용자에게 표시하지 않음
- 얼굴 landmark가 있으면 양쪽 눈 둘레를 청록색 또는 흰색 선으로 그림
- 눈 감김 중에는 눈 윤곽을 주황색으로 변경
- 캔버스에 사용자명, 토큰, API 데이터는 그리지 않음

MediaPipe의 얼굴 랜드마크 연결 상수 또는 눈 인덱스를 사용한다. 눈 윤곽이 프레임 위치와 맞도록 좌우 반전을 동일하게 적용한다. 실제 사람 mask가 보이지 않으면 해당 구현은 완료로 판정하지 않는다.

## 9. 단계별 동작

### `startDetection()`

- 카메라가 없으면 `prepareCamera()`를 await한다.
- 눈 감김 시작값과 경고 상태를 초기화한다.
- phase를 `running`으로 바꾼다.
- 분석 interval을 정확히 하나 시작한다.

### `pauseDetection()`

- 분석 interval을 해제한다.
- 눈 감김 시작값과 `closedForMs`를 0으로 만든다.
- 활성 경고를 해제한다.
- 카메라 미리보기는 유지할 수 있다.
- phase를 `paused`로 바꾼다.

### `resumeDetection()`

- 경고와 눈 감김 누적을 0부터 시작한다.
- 분석 interval을 하나 시작한다.
- phase를 `running`으로 바꾼다.

### `stopDetection()`

- 모든 interval과 animation frame을 취소한다.
- `stream.getTracks().forEach(track => track.stop())`을 호출한다.
- video의 `srcObject`를 null로 만든다.
- 임시 canvas와 결과 참조를 비운다.
- 활성 경고에 `SESSION_END`를 전송하고 보조 창을 닫는다.
- snapshot을 초기 상태로 되돌린다.

Provider unmount와 `beforeunload`에서도 stop과 동등한 동기 cleanup을 시도한다.

## 10. 보조 경고 창

### 10.1 창 열기

`openAlertWindow()`는 비동기 함수가 아니어야 한다. 호출 즉시 다음을 수행한다.

```ts
window.open(
  '/alert.html',
  'beetle-alert',
  'popup=yes,width=720,height=520,left=80,top=80'
);
```

열린 참조를 저장하고 반환한다. null이면 팝업 차단 상태다. 이미 같은 창이 열려 있으면 재사용한다.

### 10.2 메시지

같은 origin만 허용하여 다음 메시지를 전송한다.

```ts
{ source: 'beetle-monitor', type: 'READY' }
{ source: 'beetle-monitor', type: 'WARNING' }
{ source: 'beetle-monitor', type: 'RECOVERED' }
{ source: 'beetle-monitor', type: 'PAUSED' }
{ source: 'beetle-monitor', type: 'SESSION_END' }
```

`alert.html`은 `event.origin === location.origin`과 `event.data.source`를 모두 검사한다.

- 대기: 어두운 배경과 `집중 감지 중` 표시
- WARNING: 빨강/주황 전체 화면 깜빡임, `눈을 뜨고 다시 집중하세요` 표시
- RECOVERED: 애니메이션 즉시 중단, 대기 화면 복귀
- PAUSED: `일시정지됨` 표시
- SESSION_END: `집중 세션 종료` 표시 후 `window.close()` 시도

WARNING 시 popup의 `focus()`를 best effort로 호출한다. 강제 포커스를 보장한다고 가정하지 않는다.

### 10.3 폴백

팝업이 없거나 닫혔다면:

- `Notification.permission === 'granted'`일 때 Notification을 한 번 표시한다.
- Notification 권한 요청은 사용자 클릭 시점인 `openAlertWindow()` 안에서만 시도할 수 있다.
- React의 `warningActive` 상태를 통해 FE-1 인앱 오버레이가 항상 표시되게 한다.

`prefers-reduced-motion: reduce`에서는 깜빡임 대신 두꺼운 고대비 정적 테두리를 사용한다.

## 11. 개인정보 기준

금지 사항:

- fetch, WebSocket, form 전송에 video/frame/landmark/blink score 포함
- 캔버스 `toDataURL`, `toBlob`을 이용한 저장
- localStorage, IndexedDB에 감지 결과 저장
- 디버그 로그에 프레임 또는 랜드마크 전체 출력

허용 사항:

- 브라우저 메모리 안에서 현재 프레임 처리
- UI 표시를 위한 숫자 blink score
- MediaPipe 모델 자산 다운로드

## 12. 자체 검수

통합 후:

```bash
cd frontend
npm run build
```

Chrome 수동 검수:

- 카메라 버튼을 누르기 전에는 권한 요청이 없다.
- 원본 video element가 화면에 보이지 않는다.
- 사람 형태와 눈 윤곽이 canvas에 표시된다.
- 한쪽 눈만 감아서는 경고하지 않는다.
- 양쪽 눈 7초 감김에서 경고가 한 번 시작된다.
- 경고 중 눈을 뜨면 0.5초 안에 깜빡임이 멈춘다.
- 일시정지 중 경고가 시작되지 않는다.
- 종료 후 카메라 사용 표시가 꺼진다.
- Network 탭에 영상·프레임 요청이 없다.

## 13. 완료 커밋

```bash
git add frontend/src/monitoring frontend/public/alert.html
git commit -m "feat(monitoring): add local eye detection and alert window"
```
