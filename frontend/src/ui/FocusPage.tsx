import type { ReactNode } from 'react';

interface FocusPageProps {
  children: ReactNode;
  remainingMs: number;
  monitorPhase: string;
  faceDetected: boolean;
  bothEyesClosed: boolean;
  closedForMs: number;
  warningActive: boolean;
  warningCount: number;
  isPaused: boolean;
  actionPending: boolean;
  error: string | null;
  onPause(): Promise<void>;
  onResume(): Promise<void>;
  onFinish(): void;
}

function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds]
    .map((part) => part.toString().padStart(2, '0'))
    .join(':');
}

const phaseLabels: Record<string, string> = {
  idle: '대기 중',
  requesting: '카메라 준비 중',
  ready: '카메라 준비됨',
  running: '눈 감지 실행 중',
  paused: '눈 감지 일시정지',
  error: '감지 오류',
};

export function FocusPage({
  children,
  remainingMs,
  monitorPhase,
  faceDetected,
  bothEyesClosed,
  closedForMs,
  warningActive,
  warningCount,
  isPaused,
  actionPending,
  error,
  onPause,
  onResume,
  onFinish,
}: FocusPageProps) {
  const cameraStatus = isPaused
    ? '일시정지됨'
    : faceDetected
      ? bothEyesClosed
        ? '얼굴 감지됨, 양쪽 눈 감김'
        : '얼굴 감지됨, 눈 열림'
      : '얼굴을 찾는 중';

  return (
    <section className="focus-layout" aria-labelledby="focus-title">
      <header className="focus-header">
        <div>
          <p className="eyebrow">비틀비틀 집중 모드</p>
          <h1 id="focus-title">집중하고 있어요</h1>
        </div>
        <div className="timer-block" aria-label={`남은 시간 ${formatDuration(remainingMs)}`}>
          <span>남은 시간</span>
          <strong>{formatDuration(remainingMs)}</strong>
        </div>
      </header>

      <div className="focus-grid">
        <div className="preview-panel focus-preview" aria-label="실시간 사람 실루엣과 눈 윤곽">
          {children}
        </div>

        <aside className="focus-controls" aria-label="집중 세션 상태와 조작">
          <dl className="status-list">
            <div>
              <dt>감지 상태</dt>
              <dd>{phaseLabels[monitorPhase] ?? monitorPhase}</dd>
            </div>
            <div>
              <dt>카메라 상태</dt>
              <dd>{cameraStatus}</dd>
            </div>
            <div>
              <dt>눈 감김 지속</dt>
              <dd>{(closedForMs / 1000).toFixed(1)}초</dd>
            </div>
            <div>
              <dt>경고 횟수</dt>
              <dd>{warningCount}회</dd>
            </div>
          </dl>

          {error && <p className="form-error" role="alert">{error}</p>}

          <div className="focus-button-stack">
            {isPaused ? (
              <button
                className="button button-primary"
                type="button"
                disabled={actionPending}
                onClick={() => void onResume()}
              >
                {actionPending ? '상태 확인 중…' : '재개'}
              </button>
            ) : (
              <button
                className="button button-primary"
                type="button"
                disabled={actionPending}
                onClick={() => void onPause()}
              >
                {actionPending ? '상태 저장 중…' : '일시정지'}
              </button>
            )}
            <button
              className="button button-danger"
              type="button"
              disabled={actionPending}
              onClick={onFinish}
            >
              집중 종료
            </button>
          </div>
        </aside>
      </div>

      {warningActive && (
        <div className="warning-overlay" role="alert" aria-live="assertive">
          <div className="warning-content">
            <strong>눈을 뜨고 다시 집중하세요</strong>
            <span>눈이 열린 것을 확인하면 경고가 자동으로 멈춥니다.</span>
          </div>
        </div>
      )}
    </section>
  );
}
