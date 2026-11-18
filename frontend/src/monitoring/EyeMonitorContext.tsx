import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  FaceLandmarker,
  FilesetResolver,
  ImageSegmenter,
} from '@mediapipe/tasks-vision';

const WASM_ROOT =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm';
const FACE_MODEL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const SEGMENT_MODEL =
  'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite';
const ANALYSIS_INTERVAL_MS = 250;
const WARNING_AFTER_MS = 7_000;
const CLOSED_THRESHOLD = 0.55;
const ALERT_SOURCE = 'beetle-monitor';

type AlertMessageType =
  | 'READY'
  | 'WARNING'
  | 'RECOVERED'
  | 'PAUSED'
  | 'SESSION_END';

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

const INITIAL_SNAPSHOT: MonitorSnapshot = {
  phase: 'idle',
  faceDetected: false,
  bothEyesClosed: false,
  leftBlinkScore: 0,
  rightBlinkScore: 0,
  closedForMs: 0,
  warningActive: false,
  errorMessage: null,
};

type CanvasBinding = {
  canvas: HTMLCanvasElement | null;
  video: HTMLVideoElement | null;
  faceLandmarks: Array<{ x: number; y: number }> | null;
  bothEyesClosed: boolean;
};

type InternalController = EyeMonitorController & {
  registerCanvas(canvas: HTMLCanvasElement | null): void;
};

const EyeMonitorContext = createContext<InternalController | null>(null);

function humanizeError(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
      return '카메라 권한이 거부되었습니다. 브라우저 설정에서 권한을 허용해 주세요.';
    }
    if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
      return '사용할 수 있는 카메라를 찾지 못했습니다.';
    }
    if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
      return '다른 프로그램이 카메라를 사용 중이거나 카메라를 시작할 수 없습니다.';
    }
  }
  return '카메라 또는 눈 감지 모델을 준비하지 못했습니다. 네트워크와 카메라 상태를 확인해 주세요.';
}

function waitForMetadata(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const onLoaded = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error('video metadata unavailable'));
    };
    const cleanup = () => {
      video.removeEventListener('loadedmetadata', onLoaded);
      video.removeEventListener('error', onError);
    };
    video.addEventListener('loadedmetadata', onLoaded, { once: true });
    video.addEventListener('error', onError, { once: true });
  });
}

export function EyeMonitorProvider(props: {
  children: React.ReactNode;
}) {
  const [snapshot, setSnapshot] = useState<MonitorSnapshot>(INITIAL_SNAPSHOT);
  const snapshotRef = useRef(snapshot);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);
  const segmenterRef = useRef<ImageSegmenter | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const closedStartedAtRef = useRef<number | null>(null);
  const warningSentRef = useRef(false);
  const alertWindowRef = useRef<Window | null>(null);
  const notificationRef = useRef<Notification | null>(null);
  const mountedRef = useRef(true);
  const initializationRef = useRef<Promise<void> | null>(null);
  const analysisBusyRef = useRef(false);
  const segmentationBusyRef = useRef(false);
  const lastSegmentedVideoTimeRef = useRef(-1);
  const preparationEpochRef = useRef(0);
  const canvasBindingRef = useRef<CanvasBinding>({
    canvas: null,
    video: null,
    faceLandmarks: null,
    bothEyesClosed: false,
  });
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const updateSnapshot = useCallback(
    (update: Partial<MonitorSnapshot> | ((current: MonitorSnapshot) => MonitorSnapshot)) => {
      setSnapshot((current) => {
        const next = typeof update === 'function' ? update(current) : { ...current, ...update };
        snapshotRef.current = next;
        return next;
      });
    },
    [],
  );

  useEffect(() => {
    snapshotRef.current = snapshot;
    canvasBindingRef.current.bothEyesClosed = snapshot.bothEyesClosed;
  }, [snapshot]);

  const postAlertMessage = useCallback((type: AlertMessageType) => {
    const popup = alertWindowRef.current;
    if (!popup || popup.closed) return false;

    popup.postMessage({ source: ALERT_SOURCE, type }, window.location.origin);
    if (type === 'WARNING') {
      try {
        popup.focus();
      } catch {
        // Browser focus policies may reject this request.
      }
    }
    return true;
  }, []);

  const clearWarning = useCallback(
    (message: AlertMessageType = 'RECOVERED') => {
      const wasActive = snapshotRef.current.warningActive;
      warningSentRef.current = false;
      notificationRef.current?.close();
      notificationRef.current = null;
      if (wasActive) postAlertMessage(message);
      updateSnapshot({ warningActive: false, closedForMs: 0 });
    },
    [postAlertMessage, updateSnapshot],
  );

  const showWarning = useCallback(() => {
    if (warningSentRef.current) return;
    warningSentRef.current = true;
    updateSnapshot({ warningActive: true });

    const deliveredToPopup = postAlertMessage('WARNING');
    if (
      !deliveredToPopup &&
      'Notification' in window &&
      Notification.permission === 'granted'
    ) {
      notificationRef.current = new Notification('집중 경고', {
        body: '눈을 뜨고 다시 집중하세요.',
        tag: 'beetle-eye-warning',
      });
    }
  }, [postAlertMessage, updateSnapshot]);

  const drawFrame = useCallback((mask: Uint8Array, width: number, height: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let maskCanvas = maskCanvasRef.current;
    if (!maskCanvas) {
      maskCanvas = document.createElement('canvas');
      maskCanvasRef.current = maskCanvas;
    }
    maskCanvas.width = width;
    maskCanvas.height = height;
    const maskContext = maskCanvas.getContext('2d');
    const context = canvas.getContext('2d');
    if (!maskContext || !context) return;

    const image = maskContext.createImageData(width, height);
    for (let index = 0; index < mask.length; index += 1) {
      const output = index * 4;
      const isPerson = mask[index] !== 0;
      image.data[output] = isPerson ? 226 : 11;
      image.data[output + 1] = isPerson ? 236 : 20;
      image.data[output + 2] = isPerson ? 238 : 28;
      image.data[output + 3] = 255;
    }
    maskContext.putImageData(image, 0, 0);

    context.save();
    context.setTransform(-1, 0, 0, 1, canvas.width, 0);
    context.imageSmoothingEnabled = true;
    context.drawImage(maskCanvas, 0, 0, canvas.width, canvas.height);

    const landmarks = canvasBindingRef.current.faceLandmarks;
    if (landmarks) {
      context.strokeStyle = canvasBindingRef.current.bothEyesClosed ? '#ff8a00' : '#62fff2';
      context.lineWidth = 3;
      context.lineJoin = 'round';
      context.lineCap = 'round';

      const drawConnections = (connections: Array<{ start: number; end: number }>) => {
        context.beginPath();
        for (const connection of connections) {
          const start = landmarks[connection.start];
          const end = landmarks[connection.end];
          if (!start || !end) continue;
          context.moveTo(start.x * canvas.width, start.y * canvas.height);
          context.lineTo(end.x * canvas.width, end.y * canvas.height);
        }
        context.stroke();
      };

      drawConnections(FaceLandmarker.FACE_LANDMARKS_LEFT_EYE);
      drawConnections(FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE);
    }
    context.restore();
  }, []);

  const startPreviewLoop = useCallback(() => {
    if (animationFrameRef.current !== null) return;

    const render = () => {
      if (!mountedRef.current) return;
      animationFrameRef.current = window.requestAnimationFrame(render);

      const video = videoRef.current;
      const segmenter = segmenterRef.current;
      if (
        !video ||
        !segmenter ||
        !canvasRef.current ||
        video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
        video.currentTime === lastSegmentedVideoTimeRef.current ||
        segmentationBusyRef.current
      ) {
        return;
      }

      segmentationBusyRef.current = true;
      lastSegmentedVideoTimeRef.current = video.currentTime;
      try {
        segmenter.segmentForVideo(video, performance.now(), (result) => {
          try {
            const categoryMask = result.categoryMask;
            if (!categoryMask) return;
            drawFrame(
              categoryMask.getAsUint8Array(),
              categoryMask.width,
              categoryMask.height,
            );
          } finally {
            result.close();
            segmentationBusyRef.current = false;
          }
        });
      } catch {
        segmentationBusyRef.current = false;
      }
    };

    animationFrameRef.current = window.requestAnimationFrame(render);
  }, [drawFrame]);

  const initializeModels = useCallback(async () => {
    if (faceLandmarkerRef.current && segmenterRef.current) return;
    const vision = await FilesetResolver.forVisionTasks(WASM_ROOT);
    const [faceLandmarker, segmenter] = await Promise.all([
      FaceLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: FACE_MODEL },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFaceBlendshapes: true,
        minFaceDetectionConfidence: 0.5,
        minFacePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      }),
      ImageSegmenter.createFromOptions(vision, {
        baseOptions: { modelAssetPath: SEGMENT_MODEL },
        runningMode: 'VIDEO',
        outputCategoryMask: true,
        outputConfidenceMasks: false,
      }),
    ]);

    if (!mountedRef.current) {
      faceLandmarker.close();
      segmenter.close();
      return;
    }
    faceLandmarkerRef.current = faceLandmarker;
    segmenterRef.current = segmenter;
  }, []);

  const prepareCamera = useCallback((): Promise<void> => {
    if (streamRef.current && faceLandmarkerRef.current && segmenterRef.current) {
      return Promise.resolve();
    }
    if (initializationRef.current) return initializationRef.current;

    const preparationEpoch = preparationEpochRef.current;
    const initialization = (async () => {
      updateSnapshot({ phase: 'requesting', errorMessage: null });
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new DOMException('Media devices unavailable', 'NotFoundError');
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 640 },
            height: { ideal: 480 },
            frameRate: { ideal: 15, max: 30 },
          },
          audio: false,
        });

        if (!mountedRef.current || preparationEpoch !== preparationEpochRef.current) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        const video = document.createElement('video');
        video.playsInline = true;
        video.muted = true;
        video.autoplay = true;
        video.srcObject = stream;
        videoRef.current = video;
        canvasBindingRef.current.video = video;
        await waitForMetadata(video);
        await video.play();
        await initializeModels();

        if (!mountedRef.current || preparationEpoch !== preparationEpochRef.current) {
          stream.getTracks().forEach((track) => track.stop());
          video.srcObject = null;
          faceLandmarkerRef.current?.close();
          segmenterRef.current?.close();
          faceLandmarkerRef.current = null;
          segmenterRef.current = null;
          return;
        }

        if (!faceLandmarkerRef.current || !segmenterRef.current) {
          throw new Error('MediaPipe models unavailable');
        }
        startPreviewLoop();
        updateSnapshot({ phase: 'ready', errorMessage: null });
        postAlertMessage('READY');
      } catch (error) {
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        if (videoRef.current) videoRef.current.srcObject = null;
        videoRef.current = null;
        updateSnapshot({ phase: 'error', errorMessage: humanizeError(error) });
        throw error;
      } finally {
        initializationRef.current = null;
      }
    })();

    initializationRef.current = initialization;
    return initialization;
  }, [initializeModels, postAlertMessage, startPreviewLoop, updateSnapshot]);

  const analyzeFrame = useCallback(() => {
    const video = videoRef.current;
    const landmarker = faceLandmarkerRef.current;
    if (
      !video ||
      !landmarker ||
      video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
      analysisBusyRef.current
    ) {
      return;
    }

    analysisBusyRef.current = true;
    try {
      const now = performance.now();
      const result = landmarker.detectForVideo(video, now);
      const exactlyOneFace = result.faceLandmarks.length === 1;

      if (!exactlyOneFace) {
        closedStartedAtRef.current = null;
        canvasBindingRef.current.faceLandmarks = null;
        if (snapshotRef.current.warningActive) clearWarning();
        updateSnapshot({
          faceDetected: false,
          bothEyesClosed: false,
          leftBlinkScore: 0,
          rightBlinkScore: 0,
          closedForMs: 0,
        });
        return;
      }

      canvasBindingRef.current.faceLandmarks = result.faceLandmarks[0];
      const categories = result.faceBlendshapes[0]?.categories ?? [];
      const left = categories.find((item) => item.categoryName === 'eyeBlinkLeft')?.score ?? 0;
      const right = categories.find((item) => item.categoryName === 'eyeBlinkRight')?.score ?? 0;
      const bothEyesClosed = left >= CLOSED_THRESHOLD && right >= CLOSED_THRESHOLD;

      if (!bothEyesClosed) {
        closedStartedAtRef.current = null;
        if (snapshotRef.current.warningActive) clearWarning();
        updateSnapshot({
          faceDetected: true,
          bothEyesClosed: false,
          leftBlinkScore: left,
          rightBlinkScore: right,
          closedForMs: 0,
        });
        return;
      }

      closedStartedAtRef.current ??= now;
      const closedForMs = now - closedStartedAtRef.current;
      updateSnapshot({
        faceDetected: true,
        bothEyesClosed: true,
        leftBlinkScore: left,
        rightBlinkScore: right,
        closedForMs,
      });
      if (closedForMs >= WARNING_AFTER_MS) showWarning();
    } catch (error) {
      updateSnapshot({ phase: 'error', errorMessage: humanizeError(error) });
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    } finally {
      analysisBusyRef.current = false;
    }
  }, [clearWarning, showWarning, updateSnapshot]);

  const startAnalysisInterval = useCallback(() => {
    if (intervalRef.current !== null) return;
    intervalRef.current = window.setInterval(analyzeFrame, ANALYSIS_INTERVAL_MS);
  }, [analyzeFrame]);

  const openAlertWindow = useCallback((): Window | null => {
    let popup = alertWindowRef.current;
    if (!popup || popup.closed) {
      popup = window.open(
        '/alert.html',
        'beetle-alert',
        'popup=yes,width=720,height=520,left=80,top=80',
      );
      alertWindowRef.current = popup;
    }

    if ('Notification' in window && Notification.permission === 'default') {
      void Notification.requestPermission();
    }
    if (popup) {
      window.setTimeout(() => postAlertMessage('READY'), 100);
    }
    return popup;
  }, [postAlertMessage]);

  const startDetection = useCallback(async () => {
    const preparationEpoch = preparationEpochRef.current;
    if (!streamRef.current || !faceLandmarkerRef.current || !segmenterRef.current) {
      await prepareCamera();
    }
    if (preparationEpoch !== preparationEpochRef.current) return;
    if (!faceLandmarkerRef.current || !segmenterRef.current) {
      updateSnapshot({ phase: 'error', errorMessage: '감지 모델이 준비되지 않았습니다.' });
      return;
    }

    closedStartedAtRef.current = null;
    warningSentRef.current = false;
    clearWarning();
    updateSnapshot({ phase: 'running', errorMessage: null });
    startAnalysisInterval();
  }, [clearWarning, prepareCamera, startAnalysisInterval, updateSnapshot]);

  const pauseDetection = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    closedStartedAtRef.current = null;
    clearWarning();
    updateSnapshot({ phase: 'paused', bothEyesClosed: false });
    postAlertMessage('PAUSED');
  }, [clearWarning, postAlertMessage, updateSnapshot]);

  const resumeDetection = useCallback(() => {
    if (!streamRef.current || !faceLandmarkerRef.current || !segmenterRef.current) {
      updateSnapshot({ phase: 'error', errorMessage: '카메라와 감지 모델을 먼저 준비해 주세요.' });
      return;
    }
    closedStartedAtRef.current = null;
    warningSentRef.current = false;
    clearWarning();
    updateSnapshot({ phase: 'running', bothEyesClosed: false, errorMessage: null });
    startAnalysisInterval();
  }, [clearWarning, startAnalysisInterval, updateSnapshot]);

  const stopDetection = useCallback(() => {
    preparationEpochRef.current += 1;
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    closedStartedAtRef.current = null;
    warningSentRef.current = false;
    analysisBusyRef.current = false;
    segmentationBusyRef.current = false;
    lastSegmentedVideoTimeRef.current = -1;
    notificationRef.current?.close();
    notificationRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    videoRef.current = null;
    canvasBindingRef.current.video = null;
    canvasBindingRef.current.faceLandmarks = null;
    maskCanvasRef.current = null;
    faceLandmarkerRef.current?.close();
    segmenterRef.current?.close();
    faceLandmarkerRef.current = null;
    segmenterRef.current = null;
    initializationRef.current = null;
    postAlertMessage('SESSION_END');
    try {
      alertWindowRef.current?.close();
    } catch {
      // Browser policies may reject closing a window not opened by this page.
    }
    alertWindowRef.current = null;
    snapshotRef.current = INITIAL_SNAPSHOT;
    if (mountedRef.current) setSnapshot(INITIAL_SNAPSHOT);
  }, [postAlertMessage]);

  const registerCanvas = useCallback((canvas: HTMLCanvasElement | null) => {
    canvasRef.current = canvas;
    canvasBindingRef.current.canvas = canvas;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const handleBeforeUnload = () => stopDetection();
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      stopDetection();
      mountedRef.current = false;
    };
  }, [stopDetection]);

  const value = useMemo<InternalController>(
    () => ({
      ...snapshot,
      prepareCamera,
      openAlertWindow,
      startDetection,
      pauseDetection,
      resumeDetection,
      stopDetection,
      registerCanvas,
    }),
    [
      snapshot,
      prepareCamera,
      openAlertWindow,
      startDetection,
      pauseDetection,
      resumeDetection,
      stopDetection,
      registerCanvas,
    ],
  );

  return <EyeMonitorContext.Provider value={value}>{props.children}</EyeMonitorContext.Provider>;
}

export function useEyeMonitor(): EyeMonitorController {
  const context = useContext(EyeMonitorContext);
  if (!context) {
    throw new Error('useEyeMonitor는 EyeMonitorProvider 안에서만 호출할 수 있습니다.');
  }
  return context;
}

export function useEyeMonitorCanvas(): Pick<InternalController, 'registerCanvas'> {
  const context = useContext(EyeMonitorContext);
  if (!context) {
    throw new Error('SilhouetteCanvas는 EyeMonitorProvider 안에서만 사용할 수 있습니다.');
  }
  return { registerCanvas: context.registerCanvas };
}

export { SilhouetteCanvas } from './SilhouetteCanvas';
