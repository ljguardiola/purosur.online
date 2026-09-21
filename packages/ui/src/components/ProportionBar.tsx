export type ProportionBarProps = {
  /** Between 0 and 1; values outside that range are clamped, and a non-finite value paints nothing. */
  value: number;
};

const trackClassName = "h-[10px] w-[240px] overflow-hidden rounded-[5px] bg-brand-blue-message-bg";

const fillClassName = "h-full rounded-[5px] bg-brand-blue-ui";

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
