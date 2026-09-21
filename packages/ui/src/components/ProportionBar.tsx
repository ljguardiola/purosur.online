export type ProportionBarProps = {
  /** Between 0 and 1; values outside that range are clamped. */
  value: number;
};

const trackClassName = "h-[10px] w-[240px] overflow-hidden rounded-[5px] bg-brand-blue-message-bg";

const fillClassName = "h-full rounded-[5px] bg-brand-blue-ui";

export function ProportionBar({ value }: ProportionBarProps) {
  const clampedValue = Math.min(1, Math.max(0, value));

  return (
    <div aria-hidden="true" className={trackClassName}>
      {/* The fill's width is a continuous value the caller controls, so it can't be one of a
          fixed set of Tailwind classes the way the track's own dimensions are. */}
      <div className={fillClassName} style={{ width: `${clampedValue * 100}%` }} />
    </div>
  );
}
