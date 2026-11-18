import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient, ApiError } from './api/client';
import type { AuthResponse, FinishReason, SessionRecord } from './contracts/api';
import {
  SilhouetteCanvas,
  useEyeMonitor,
} from './monitoring/EyeMonitorContext';
import { FocusPage } from './ui/FocusPage';
import { LobbyPage } from './ui/LobbyPage';
import { LoginPage } from './ui/LoginPage';
import { SetupPage } from './ui/SetupPage';
import './ui/app.css';

type Screen = 'login' | 'lobby' | 'setup' | 'focus' | 'finished';

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return '알 수 없는 오류가 발생했습니다.';
}

const finishLabels: Record<FinishReason, string> = {
  completed: '설정한 집중 시간을 완료했습니다.',
  manual: '집중 세션을 종료했습니다.',
  logout: '로그아웃하며 집중 세션을 종료했습니다.',
  error: '오류로 인해 집중 세션을 종료했습니다.',
};

export function App() {
  const monitor = useEyeMonitor();
  const monitorRef = useRef(monitor);
  monitorRef.current = monitor;

  const [screen, setScreen] = useState<Screen>('login');
  const [token, setToken] = useState<string | null>(null);
  const [durationSeconds, setDurationSeconds] = useState(25 * 60);
  const [session, setSession] = useState<SessionRecord | null>(null);
  const [remainingMs, setRemainingMs] = useState(durationSeconds * 1000);
  const [isPaused, setIsPaused] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [sessionActionPending, setSessionActionPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [finishReason, setFinishReason] = useState<FinishReason | null>(null);

  const tokenRef = useRef<string | null>(null);
  const sessionRef = useRef<SessionRecord | null>(null);
  const remainingRef = useRef(remainingMs);
  const deadlineRef = useRef(0);
  const timerIntervalRef = useRef<number | null>(null);
  const endingRef = useRef(false);
  const startInFlightRef = useRef(false);
  const previousWarningRef = useRef(false);

  const updateRemaining = useCallback((nextMs: number) => {
    remainingRef.current = nextMs;
    setRemainingMs(nextMs);
  }, []);

  const clearTimer = useCallback(() => {
    if (timerIntervalRef.current !== null) {
      window.clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  }, []);

  const finishFocus = useCallback(
    async (reason: FinishReason) => {
      if (endingRef.current) {
        return;
      }
      endingRef.current = true;
      clearTimer();

      // Camera, analysis, and alert-window resources are released before the API call.
      monitorRef.current.stopDetection();
      if (reason === 'completed') {
        updateRemaining(0);
      }

      setSessionActionPending(true);
      setError(null);
      setFinishReason(reason);

      const activeToken = tokenRef.current;
      const activeSession = sessionRef.current;
      try {
        if (activeToken && activeSession) {
          const finished = await apiClient.finishSession(
            activeToken,
            activeSession.id,
            reason,
          );
          sessionRef.current = finished;
          setSession(finished);
        }
      } catch (finishError) {
        setError(
          `카메라는 종료했지만 세션 종료 기록을 저장하지 못했습니다: ${errorMessage(
            finishError,
          )}`,
        );
      } finally {
        setSessionActionPending(false);
        setIsPaused(false);
        setScreen('finished');
      }
    },
    [clearTimer, updateRemaining],
  );

  useEffect(() => {
    if (screen !== 'focus' || isPaused || endingRef.current) {
      clearTimer();
      return;
    }

    const tick = () => {
      const nextRemaining = Math.max(0, deadlineRef.current - Date.now());
      updateRemaining(nextRemaining);
      if (nextRemaining === 0) {
        clearTimer();
        void finishFocus('completed');
      }
    };

    tick();
    timerIntervalRef.current = window.setInterval(tick, 250);
    return clearTimer;
  }, [clearTimer, finishFocus, isPaused, screen, updateRemaining]);

  useEffect(() => {
    const warningStarted =
      screen === 'focus' &&
      monitor.warningActive &&
      !previousWarningRef.current;
    previousWarningRef.current = monitor.warningActive;

    const activeToken = tokenRef.current;
    const activeSession = sessionRef.current;
    if (
      endingRef.current ||
      !warningStarted ||
      !activeToken ||
      !activeSession
    ) {
      return;
    }

    void apiClient
      .recordWarning(activeToken, activeSession.id)
      .then((updated) => {
        if (
          !endingRef.current &&
          sessionRef.current?.id === activeSession.id
        ) {
          sessionRef.current = updated;
          setSession(updated);
        }
      })
      .catch((warningError) => {
        if (
          !endingRef.current &&
          sessionRef.current?.id === activeSession.id
        ) {
          setError(`경고 횟수를 저장하지 못했습니다: ${errorMessage(warningError)}`);
        }
      });
  }, [monitor.warningActive, screen]);

  async function handleLogin(username: string, password: string) {
    setError(null);
    try {
      const response: AuthResponse = await apiClient.login(username, password);
      tokenRef.current = response.access_token;
      setToken(response.access_token);
      setScreen('lobby');
    } catch (loginError) {
      setError(errorMessage(loginError));
      throw loginError;
    }
  }

  async function handlePrepareCamera() {
    setError(null);
    try {
      await monitorRef.current.prepareCamera();
    } catch (cameraError) {
      setError(errorMessage(cameraError));
      throw cameraError;
    }
  }

  async function handleStart() {
    monitor.openAlertWindow();
    if (startInFlightRef.current) {
      return;
    }
    startInFlightRef.current = true;
    setIsStarting(true);
    setError(null);
    endingRef.current = false;
    previousWarningRef.current = false;

    let createdSession: SessionRecord | null = null;
    try {
      if (monitorRef.current.phase !== 'ready') {
        await monitorRef.current.prepareCamera();
      }
      if (!tokenRef.current) {
        throw new Error('로그인 정보가 없습니다. 다시 로그인해 주세요.');
      }

      createdSession = await apiClient.startSession(
        tokenRef.current,
        durationSeconds,
      );
      sessionRef.current = createdSession;
      setSession(createdSession);
      updateRemaining(durationSeconds * 1000);
      deadlineRef.current = Date.now() + durationSeconds * 1000;

      await monitorRef.current.startDetection();
      setIsPaused(false);
      setScreen('focus');
    } catch (startError) {
      monitorRef.current.stopDetection();
      if (createdSession && tokenRef.current) {
        try {
          await apiClient.finishSession(
            tokenRef.current,
            createdSession.id,
            'error',
          );
        } catch {
          // The original start failure is the actionable error shown to the user.
        }
      }
      sessionRef.current = null;
      setSession(null);
      setError(`집중 세션을 시작하지 못했습니다: ${errorMessage(startError)}`);
    } finally {
      startInFlightRef.current = false;
      setIsStarting(false);
    }
  }

  async function handlePause() {
    const activeSession = sessionRef.current;
    const activeToken = tokenRef.current;
    if (
      !activeSession ||
      !activeToken ||
      sessionActionPending ||
      endingRef.current
    ) {
      return;
    }

    clearTimer();
    updateRemaining(Math.max(0, deadlineRef.current - Date.now()));
    setIsPaused(true);
    monitorRef.current.pauseDetection();
    setSessionActionPending(true);
    setError(null);

    try {
      const updated = await apiClient.pauseSession(
        activeToken,
        activeSession.id,
      );
      if (
        !endingRef.current &&
        sessionRef.current?.id === activeSession.id
      ) {
        sessionRef.current = updated;
        setSession(updated);
      }
    } catch (pauseError) {
      if (
        !endingRef.current &&
        sessionRef.current?.id === activeSession.id
      ) {
        setError(`일시정지 상태를 서버와 동기화하지 못했습니다: ${errorMessage(pauseError)}`);
      }
    } finally {
      if (
        !endingRef.current &&
        sessionRef.current?.id === activeSession.id
      ) {
        setSessionActionPending(false);
      }
    }
  }

  async function handleResume() {
    const activeSession = sessionRef.current;
    const activeToken = tokenRef.current;
    if (
      !activeSession ||
      !activeToken ||
      sessionActionPending ||
      endingRef.current
    ) {
      return;
    }
    if (remainingRef.current <= 0) {
      void finishFocus('completed');
      return;
    }

    setSessionActionPending(true);
    setError(null);
    try {
      const updated = await apiClient.resumeSession(
        activeToken,
        activeSession.id,
      );
      if (
        endingRef.current ||
        sessionRef.current?.id !== activeSession.id
      ) {
        return;
      }
      sessionRef.current = updated;
      setSession(updated);
      deadlineRef.current = Date.now() + remainingRef.current;
      monitorRef.current.resumeDetection();
      setIsPaused(false);
    } catch (resumeError) {
      if (
        !endingRef.current &&
        sessionRef.current?.id === activeSession.id
      ) {
        setError(`재개 상태를 서버와 동기화하지 못했습니다: ${errorMessage(resumeError)}`);
      }
    } finally {
      if (
        !endingRef.current &&
        sessionRef.current?.id === activeSession.id
      ) {
        setSessionActionPending(false);
      }
    }
  }

  function handleLogout() {
    if (token === null) {
      return;
    }
    monitorRef.current.stopDetection();
    clearTimer();
    tokenRef.current = null;
    sessionRef.current = null;
    setToken(null);
    setSession(null);
    setError(null);
    setFinishReason(null);
    setScreen('login');
  }

  function handleReturnToLogin() {
    tokenRef.current = null;
    sessionRef.current = null;
    setToken(null);
    setSession(null);
    setError(null);
    setFinishReason(null);
    setScreen('login');
  }

  return (
    <main className="app-shell">
      {screen === 'login' && <LoginPage error={error} onLogin={handleLogin} />}

      {screen === 'lobby' && (
        <LobbyPage
          monitorPhase={monitor.phase}
          monitorError={monitor.errorMessage}
          error={error}
          onPrepareCamera={handlePrepareCamera}
          onContinue={() => {
            setError(null);
            setScreen('setup');
          }}
          onLogout={handleLogout}
        >
          <SilhouetteCanvas />
        </LobbyPage>
      )}

      {screen === 'setup' && (
        <SetupPage
          durationSeconds={durationSeconds}
          monitorPhase={monitor.phase}
          monitorError={monitor.errorMessage}
          error={error}
          isStarting={isStarting}
          onDurationChange={(nextDuration) => {
            setDurationSeconds(nextDuration);
            updateRemaining(nextDuration * 1000);
          }}
          onBack={() => {
            setError(null);
            setScreen('lobby');
          }}
          onStart={handleStart}
        >
          <SilhouetteCanvas />
        </SetupPage>
      )}

      {screen === 'focus' && (
        <FocusPage
          remainingMs={remainingMs}
          monitorPhase={monitor.phase}
          faceDetected={monitor.faceDetected}
          bothEyesClosed={monitor.bothEyesClosed}
          closedForMs={monitor.closedForMs}
          warningActive={monitor.warningActive}
          warningCount={session?.warning_count ?? 0}
          isPaused={isPaused}
          actionPending={sessionActionPending}
          error={error ?? monitor.errorMessage}
          onPause={handlePause}
          onResume={handleResume}
          onFinish={() => void finishFocus('manual')}
        >
          <SilhouetteCanvas />
        </FocusPage>
      )}

      {screen === 'finished' && (
        <section className="page-card finished-card" aria-labelledby="finished-title">
          <p className="eyebrow">비틀비틀</p>
          <h1 id="finished-title">집중 세션 종료</h1>
          <p className="finished-message">
            {finishReason ? finishLabels[finishReason] : '집중 세션을 종료했습니다.'}
          </p>
          {session && (
            <p className="session-summary">
              이번 세션에서 감지된 눈 감김 경고: <strong>{session.warning_count}회</strong>
            </p>
          )}
          {error && <p className="form-error" role="alert">{error}</p>}
          <button
            className="button button-primary"
            type="button"
            disabled={sessionActionPending}
            onClick={handleReturnToLogin}
          >
            로그인 화면으로
          </button>
        </section>
      )}
    </main>
  );
}
