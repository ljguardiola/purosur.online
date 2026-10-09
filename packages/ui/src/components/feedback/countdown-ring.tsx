import { formatCountdown } from "../../messages/formatters";

export type CountdownRingProps = {
  remainingSeconds: number;
  totalSeconds: number;
  label: string;
};

const VIEW_SIZE = 148;
const STROKE_WIDTH = 10;
const RADIUS = (VIEW_SIZE - STROKE_WIDTH) / 2;
const ARC_LENGTH = 100;

export function CountdownRing({ remainingSeconds, totalSeconds, label }: CountdownRingProps) {
  const remaining = Math.min(Math.max(remainingSeconds, 0), totalSeconds);
  const share = totalSeconds > 0 ? (remaining / totalSeconds) * ARC_LENGTH : 0;
  const circle = {
    cx: VIEW_SIZE / 2,
    cy: VIEW_SIZE / 2,
    r: RADIUS,
    fill: "none",
    strokeWidth: STROKE_WIDTH,
  };

  return (
    <div
      role="timer"
      aria-label={label}
      className="relative inline-flex size-37 items-center justify-center font-sans"
    >
      <svg
        aria-hidden="true"
        viewBox={`0 0 ${VIEW_SIZE} ${VIEW_SIZE}`}
        className="absolute inset-0 size-full -rotate-90"
      >
        <circle {...circle} className="stroke-border" />
        <circle
          {...circle}
          pathLength={ARC_LENGTH}
          strokeDasharray={`${share} ${ARC_LENGTH}`}
          className="stroke-info"
        />
      </svg>
      <div className="relative flex flex-col items-center">
        <span className="text-display font-bold text-info">{formatCountdown(remaining)}</span>
        <span className="text-detail text-text-subtle">de {formatCountdown(totalSeconds)}</span>
      </div>
    </div>
  );
}
