import { formatCountdown } from "../../messages/formatters";
import { Eyebrow } from "../layout/eyebrow";
import { type Tone, toneClassName } from "../shared/tone";

export type CountdownCardProps = {
  remainingSeconds: number;
  totalSeconds: number;
  label: string;
  tone?: "info" | "danger";
};

const VIEW_SIZE = 40;
const STROKE_WIDTH = 4;
const RADIUS = (VIEW_SIZE - STROKE_WIDTH) / 2;
const ARC_LENGTH = 100;

const toneOf = {
  info: { tone: "info", arc: "stroke-info" },
  danger: { tone: "error", arc: "stroke-error" },
} as const satisfies Record<NonNullable<CountdownCardProps["tone"]>, { tone: Tone; arc: string }>;

export function CountdownCard({
  remainingSeconds,
  totalSeconds,
  label,
  tone = "info",
}: CountdownCardProps) {
  const remaining = Math.min(Math.max(remainingSeconds, 0), totalSeconds);
  const share = totalSeconds > 0 ? (remaining / totalSeconds) * ARC_LENGTH : 0;
  const look = toneOf[tone];
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
      className={`flex w-full items-center gap-4 rounded-xl px-4 py-3 font-sans ${toneClassName[look.tone].surface}`}
    >
      <svg
        aria-hidden="true"
        viewBox={`0 0 ${VIEW_SIZE} ${VIEW_SIZE}`}
        className="size-10 shrink-0 -rotate-90"
      >
        <circle {...circle} className="stroke-border" />
        <circle
          {...circle}
          pathLength={ARC_LENGTH}
          strokeDasharray={`${share} ${ARC_LENGTH}`}
          className={look.arc}
        />
      </svg>
      <div className="flex flex-col">
        <Eyebrow text={label} tone={look.tone} />
        <span className={`text-display font-bold ${toneClassName[look.tone].strongText}`}>
          {formatCountdown(remaining)}
        </span>
      </div>
    </div>
  );
}
