# 비틀비틀

브라우저 안에서 양쪽 눈 감김을 감지해 집중 복귀를 돕는 React·FastAPI 프로토타입입니다.

## 데모 계정

- 아이디: `demo`
- 비밀번호: `beetle`

## 백엔드 실행

PowerShell에서 다음 명령을 실행합니다.

```powershell
Set-Location backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

백엔드는 `http://localhost:8000`에서 실행됩니다. 상태 확인 주소는 `http://localhost:8000/api/health`입니다.

## 프론트엔드 실행

별도 PowerShell 터미널에서 다음 명령을 실행합니다.

```powershell
Set-Location frontend
npm install
npm run dev
```

프론트엔드는 `http://localhost:5173`에서 실행됩니다. 다른 API 주소를 사용할 때는 `VITE_API_BASE_URL` 환경 변수를 지정합니다.

## Chrome 권한

최신 데스크톱 Chrome의 `localhost` 환경을 기준으로 합니다. 집중 시작 전에 사이트의 카메라 권한을 허용해야 합니다. 보조 경고 창과 브라우저 알림을 사용하려면 Chrome에서 이 사이트의 팝업과 알림도 허용해야 합니다.

운영체제나 브라우저 정책이 창 포커스 이동을 차단할 수 있습니다. 이 경우 브라우저 알림과 원래 화면의 경고 오버레이를 대체 수단으로 사용합니다. 백그라운드 탭에서는 타이머 실행 간격이 지연될 수 있으므로 실제 시각 차이를 기준으로 시간을 계산합니다.

## 개인정보와 프로토타입 범위

카메라 프레임, 얼굴 랜드마크, 눈 감김 점수는 브라우저 메모리 안에서만 처리하며 서버로 전송하거나 저장하지 않습니다. 서버에는 세션 시간, 상태, 일시정지 시간, 경고 횟수 등 세션 요약만 저장합니다.

이 프로토타입은 실제 시선 방향이나 응시 지점을 추적하지 않습니다. 얼굴 이탈도 판정하지 않으며, MediaPipe가 인식한 양쪽 눈이 연속 7초 이상 감긴 경우만 경고합니다.

## 검수 상태

이 브랜치는 공용 애플리케이션 골격과 API 계약을 제공합니다. 인증, 세션 저장, 카메라 감지, 화면 UI 기능 브랜치가 모두 병합된 후 백엔드 테스트, 프론트엔드 빌드, HTTP smoke test와 Chrome 수동 시나리오를 최종 검수해야 합니다.
