interface DurationPickerProps {
  valueSeconds: number;
  onChange(nextSeconds: number): void;
}

const MIN_DURATION_SECONDS = 10;
const MAX_DURATION_SECONDS = 4 * 60 * 60;

function clampDuration(seconds: number): number {
  return Math.min(MAX_DURATION_SECONDS, Math.max(MIN_DURATION_SECONDS, seconds));
}

function padded(value: number): string {
  return value.toString().padStart(2, '0');
}

export function DurationPicker({ valueSeconds, onChange }: DurationPickerProps) {
  const safeValue = clampDuration(valueSeconds);
  const hours = Math.floor(safeValue / 3600);
  const minutes = Math.floor((safeValue % 3600) / 60);
  const seconds = safeValue % 60;

  function changeBy(stepSeconds: number) {
    onChange(clampDuration(safeValue + stepSeconds));
  }

  const columns = [
    { label: '시간', value: hours, step: 3600 },
    { label: '분', value: minutes, step: 60 },
    { label: '초', value: seconds, step: 10 },
  ];

  return (
    <div className="duration-picker" aria-labelledby="duration-label">
      <p id="duration-label" className="duration-label">집중 시간</p>
      <output className="duration-output" aria-live="polite">
        {padded(hours)}:{padded(minutes)}:{padded(seconds)}
      </output>

      <div className="duration-columns">
        {columns.map((column) => (
          <div className="duration-column" key={column.label}>
            <button
              className="step-button"
              type="button"
              aria-label={`${column.label} 올리기`}
              disabled={safeValue >= MAX_DURATION_SECONDS}
              onClick={() => changeBy(column.step)}
            >
              <span aria-hidden="true">▲</span>
            </button>
            <span className="duration-value" aria-hidden="true">{padded(column.value)}</span>
            <span className="duration-unit">{column.label}</span>
            <button
              className="step-button"
              type="button"
              aria-label={`${column.label} 내리기`}
              disabled={safeValue <= MIN_DURATION_SECONDS}
              onClick={() => changeBy(-column.step)}
            >
              <span aria-hidden="true">▼</span>
            </button>
          </div>
        ))}
      </div>
      <p className="helper-text">10초부터 4시간까지 설정할 수 있습니다.</p>
    </div>
  );
}
