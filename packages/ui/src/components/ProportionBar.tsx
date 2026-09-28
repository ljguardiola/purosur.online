export type ProportionBarProps = {
  value: number;
};

const trackClassName = "h-2.5 w-60 overflow-hidden rounded-full bg-data-subtle";

const fillClassName = "h-full rounded-full bg-data";

function paintedFraction(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

export function ProportionBar({ value }: ProportionBarProps) {
  return (
    <div aria-hidden="true" className={trackClassName}>
      <div className={fillClassName} style={{ width: `${paintedFraction(value) * 100}%` }} />
    </div>
  );
}
