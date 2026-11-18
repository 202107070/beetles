import type { ReactNode } from 'react';

interface LobbyPageProps {
  children: ReactNode;
  monitorPhase: string;
  monitorError: string | null;
  error: string | null;
  onPrepareCamera(): Promise<void>;
  onContinue(): void;
  onLogout(): void;
}

const phaseLabels: Record<string, string> = {
  idle: '카메라를 아직 시작하지 않았습니다.',
  requesting: '카메라와 감지 모델을 준비하고 있습니다.',
  ready: '카메라 미리보기가 준비되었습니다.',
  running: '눈 감지가 실행 중입니다.',
  paused: '눈 감지가 일시정지되었습니다.',
  error: '카메라를 준비하지 못했습니다.',
};

export function LobbyPage({
  children,
  monitorPhase,
  monitorError,
  error,
  onPrepareCamera,
  onContinue,
  onLogout,
}: LobbyPageProps) {
  const isPreparing = monitorPhase === 'requesting';

  return (
    <section className="page-card wide-card" aria-labelledby="lobby-title">
      <header className="page-header">
        <div>
          <p className="eyebrow">비틀비틀</p>
          <h1 id="lobby-title">집중 모드 준비</h1>
        </div>
        <button className="button button-quiet" type="button" onClick={onLogout}>
          로그아웃
        </button>
      </header>

      <div className="two-column">
        <div className="content-panel">
          <p className="lead">눈 감김을 감지해 집중 복귀를 돕는 브라우저 집중 모드</p>
          <ul className="notice-list">
            <li>카메라 영상은 브라우저 안에서만 처리되며 저장하거나 서버로 전송하지 않습니다.</li>
            <li>최신 데스크톱 Chrome에서 팝업과 알림 권한을 허용해 주세요.</li>
            <li>실제 시선 방향이 아닌 양쪽 눈 감김만 감지합니다.</li>
          </ul>

          <p className="status-text" role="status">
            {phaseLabels[monitorPhase] ?? '카메라 상태를 확인하고 있습니다.'}
          </p>
          {(error || monitorError) && (
            <p className="form-error" role="alert">{error ?? monitorError}</p>
          )}

          <div className="button-row">
            <button
              className="button button-secondary"
              type="button"
              disabled={isPreparing}
              onClick={() => void onPrepareCamera().catch(() => undefined)}
            >
              {isPreparing ? '준비 중…' : '카메라 미리보기'}
            </button>
            <button className="button button-primary" type="button" onClick={onContinue}>
              시간 설정으로 이동
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
