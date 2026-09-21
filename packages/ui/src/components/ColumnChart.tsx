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
const MINIMUM_TOP_TICK = 1000;

const rowTopClassName = [
  "top-0",
  "top-[30px]",
  "top-[60px]",
  "top-[90px]",
  "top-[120px]",
  "top-[150px]",
];

// The top tick's line box is centered on the top grid line, so half of it sits above the plot.
const chartClassName = "pt-2";
const axisPlotRowClassName = "flex gap-3";
const axisColumnClassName = "relative h-[150px] w-16";
const axisTickClassName =
  "absolute inset-x-0 -translate-y-1/2 text-right text-xs font-normal text-ink-secondary";
const plotClassName = "relative h-[150px] flex-1";
const gridLineClassName = "absolute inset-x-0 h-px bg-line";
const barsRowClassName = "absolute inset-0 flex items-end gap-[11px]";
const barClassName = "w-5 shrink-0 rounded-t-[4px] bg-brand-blue-ui";
const labelRowClassName = "mt-1.5 flex gap-3";
const axisSpacerClassName = "w-16 shrink-0";
const labelsContainerClassName = "flex flex-1 gap-[11px]";
const labelColumnClassName = "flex w-5 shrink-0 justify-center";
const labelTextClassName = "text-xs font-normal whitespace-nowrap text-ink-secondary";
const emptyMessageClassName = "text-xs font-normal text-ink-secondary";
const announcedListClassName = "sr-only";
const announcedPartClassName = "block";

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

function isPlottableValue(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function computeTopTick(bars: ColumnChartBar[]): number {
  const plottable = bars.map((bar) => bar.value).filter(isPlottableValue);
  const highest = Math.max(0, ...plottable);
  const topTick = roundUpToNiceStep(highest / 5) * 5;
  return topTick > 0 ? topTick : MINIMUM_TOP_TICK;
}

function tickValues(topTick: number): number[] {
  return Array.from({ length: TICK_COUNT }, (_, index) => (topTick * (TICK_COUNT - 1 - index)) / 5);
}

function barHeightPx(value: number, topTick: number): number {
  if (!isPlottableValue(value)) {
    return 0;
  }
  return (value / topTick) * PLOT_HEIGHT_PX;
}

export function ColumnChart({ bars, formatValue, emptyMessage }: ColumnChartProps) {
  if (bars.length === 0) {
    return <p className={emptyMessageClassName}>{emptyMessage}</p>;
  }

  const topTick = computeTopTick(bars);
  const ticks = tickValues(topTick);

  return (
    <div className={chartClassName}>
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
                <span className={labelTextClassName}>{bar.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <ul className={announcedListClassName}>
        {bars
          .filter((bar) => isPlottableValue(bar.value))
          .map((bar) => (
            <li key={bar.id}>
              {bar.label === undefined ? null : (
                <span className={announcedPartClassName}>{bar.label}</span>
              )}
              <span className={announcedPartClassName}>{formatValue(bar.value)}</span>
            </li>
          ))}
      </ul>
    </div>
  );
}
