import { useEffect, useRef } from 'react';
import { useEyeMonitorCanvas } from './EyeMonitorContext';
import './monitoring.css';

export function SilhouetteCanvas(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { registerCanvas } = useEyeMonitorCanvas();

  useEffect(() => {
    registerCanvas(canvasRef.current);
    return () => registerCanvas(null);
  }, [registerCanvas]);

  return (
    <canvas
      ref={canvasRef}
      className="silhouette-canvas"
      width={640}
      height={480}
      aria-label="실시간 사람 실루엣과 눈 윤곽"
      role="img"
    />
  );
}
