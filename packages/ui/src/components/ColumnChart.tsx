export type ColumnChartBar = {
  id: string;
  label?: string;
  value: number;
};

export type ColumnChartProps = {
  bars: ColumnChartBar[];
  formatValue: (value: number) => string;
  emptyMessage: string;
};

const PLOT_HEIGHT_PX = 150;
const TICK_COUNT = 6;

// One value per grid line/tick index (0 = the top line, 5 = the zero line), evenly spaced across
// the plot's 150px height. Static per index rather than computed, since the count and spacing
// never change: only the tick values and the bar heights depend on the caller's data.
const rowTopClassName = [
  "top-0",
  "top-[30px]",
  "top-[60px]",
  "top-[90px]",
  "top-[120px]",
  "top-[150px]",
];

const axisPlotRowClassName = "flex gap-3";
const axisColumnClassName = "relative h-[150px] w-16";
const axisTickClassName =
  "absolute inset-x-0 -translate-y-1/2 text-right text-xs font-normal text-ink-secondary";
const plotClassName = "relative h-[150px] flex-1";
const gridLineClassName = "absolute inset-x-0 h-px bg-line";
const barsRowClassName = "absolute inset-0 flex items-end gap-[11px]";
const barClassName = "w-5 rounded-t-[4px] bg-brand-blue-ui";
const labelRowClassName = "mt-1.5 flex gap-3";
const axisSpacerClassName = "w-16 shrink-0";
const labelsContainerClassName = "flex flex-1 gap-[11px]";
const labelColumnClassName =
  "w-5 shrink-0 text-center text-xs font-normal whitespace-nowrap text-ink-secondary";
const emptyMessageClassName = "text-ink-secondary";

// Rounds a raw interval up to the next "nice" number of the form 1, 2 or 5 times a power of ten,
// the way a chart library picks round axis steps instead of an arbitrary one.
function roundUpToNiceStep(value: number): number {
  if (value <= 0) {
    return 0;
  }
  // log10 can land a hair below an exact power of ten (e.g. log10(100) as 1.9999999999998) due
  // to floating-point rounding, which would floor to the wrong magnitude; the epsilon corrects it.
  const magnitude = 10 ** Math.floor(Math.log10(value) + 1e-9);
  const normalized = value / magnitude;
  const niceNormalized = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return niceNormalized * magnitude;
}

function computeTopTick(bars: ColumnChartBar[]): number {
  const highest = Math.max(0, ...bars.map((bar) => bar.value));
  return roundUpToNiceStep(highest / 5) * 5;
}

function tickValues(topTick: number): number[] {
  return Array.from({ length: TICK_COUNT }, (_, index) => (topTick * (TICK_COUNT - 1 - index)) / 5);
}

function barHeightPx(value: number, topTick: number): number {
  return topTick > 0 ? (value / topTick) * PLOT_HEIGHT_PX : 0;
}

function accessibleBarText(bar: ColumnChartBar, formatValue: (value: number) => string): string {
  const formatted = formatValue(bar.value);
  return bar.label ? `${bar.label}: ${formatted}` : formatted;
}

export function ColumnChart({ bars, formatValue, emptyMessage }: ColumnChartProps) {
  if (bars.length === 0) {
    return <p className={emptyMessageClassName}>{emptyMessage}</p>;
  }

  const topTick = computeTopTick(bars);
  const ticks = tickValues(topTick);

  return (
    <div>
      {/* Every visual part below duplicates, or is redundant with, the text the accessible list
          carries, so it is hidden from assistive technology the same way InlineNotice hides its
          own visible title/detail in favor of NoticeLiveRegion's text. */}
      <div aria-hidden="true">
        <div className={axisPlotRowClassName}>
          <div className={axisColumnClassName}>
            {ticks.map((tick, index) => (
              <span
                key={rowTopClassName[index]}
                className={`${axisTickClassName} ${rowTopClassName[index]}`}
              >
                {formatValue(tick)}
              </span>
            ))}
          </div>
          <div className={plotClassName}>
            {rowTopClassName.map((topClassName) => (
              <div key={topClassName} className={`${gridLineClassName} ${topClassName}`} />
            ))}
            <div className={barsRowClassName}>
              {bars.map((bar) => (
                <div
                  key={bar.id}
                  className={barClassName}
                  // The bar's height is a continuous value the caller controls, so it can't be
                  // one of a fixed set of Tailwind classes the way the bar's other sizing is.
                  style={{ height: `${barHeightPx(bar.value, topTick)}px` }}
                />
              ))}
            </div>
          </div>
        </div>
        <div className={labelRowClassName}>
          <div className={axisSpacerClassName} />
          <div className={labelsContainerClassName}>
            {bars.map((bar) => (
              <div key={bar.id} className={labelColumnClassName}>
                {bar.label}
              </div>
            ))}
          </div>
        </div>
      </div>
      {/* The "listitem" role isn't one ARIA computes a name from its own content for, so each
          item's announced text is given explicitly through aria-label rather than left as text
          the accessible-name algorithm would otherwise ignore. */}
      <ul className="sr-only">
        {bars.map((bar) => (
          <li key={bar.id} aria-label={accessibleBarText(bar, formatValue)} />
        ))}
      </ul>
    </div>
  );
}
