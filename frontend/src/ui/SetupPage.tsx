import type { ReactNode } from 'react';
import { DurationPicker } from './DurationPicker';

interface SetupPageProps {
  children: ReactNode;
  durationSeconds: number;
  monitorPhase: string;
  monitorError: string | null;
  error: string | null;
  isStarting: boolean;
  onDurationChange(nextSeconds: number): void;
  onBack(): void;
  onStart(): Promise<void>;
}

export function SetupPage({
  children,
  durationSeconds,
  monitorPhase,
  monitorError,
  error,
  isStarting,
  onDurationChange,
  onBack,
  onStart,
}: SetupPageProps) {
  return (
    <section className="page-card wide-card" aria-labelledby="setup-title">
      <header className="page-header">
        <div>
          <p className="eyebrow">집중 시간 설정</p>
          <h1 id="setup-title">얼마나 집중할까요?</h1>
        </div>
        <p className="compact-status" role="status">
          카메라: {monitorPhase === 'ready' ? '준비됨' : '시작할 때 준비'}
        </p>
      </header>

      <div className="two-column setup-columns">
        <div className="content-panel">
          <DurationPicker valueSeconds={durationSeconds} onChange={onDurationChange} />
          <p className="helper-text">
            집중 시작을 누르면 경고 창을 먼저 열고 카메라와 세션을 시작합니다.
          </p>
          {(error || monitorError) && (
            <p className="form-error" role="alert">{error ?? monitorError}</p>
          )}
          <div className="button-row">
            <button
              className="button button-secondary"
              type="button"
              disabled={isStarting}
              onClick={onBack}
            >
              로비로
            </button>
            <button
              className="button button-primary"
              type="button"
              disabled={isStarting}
              onClick={() => void onStart()}
            >
              {isStarting ? '집중 모드 준비 중…' : '집중 시작'}
            </button>
          </div>
        </div>

        <div className="preview-panel" aria-label="카메라 실루엣 미리보기">
          {children}
        </div>
      </div>
    </section>
  );
}
