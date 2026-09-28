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

const rowTopClassName = ["top-0", "top-7.5", "top-15", "top-22.5", "top-30", "top-37.5"];

// pt-2 clears the top tick's own line box, which centers on the grid line and extends above it.
const chartBoxClassName = "pt-2";
const chartWidthClassName = "w-max min-w-full";
// The axis column and the labels' spacer share the first grid track, so an axis that grows to fit
// a wide tick moves the labels by exactly as much as the bars.
const visualGridClassName = "grid grid-cols-chart gap-x-3 gap-y-1.5";
// The negative margin and taller-than-plot height clear the top and bottom ticks' own line boxes,
// which extend past the plot's grid lines the same way chartBoxClassName's pt-2 does.
const axisColumnClassName = "-my-2 flex h-41.5 flex-col justify-between";
// A fixed height, so a tick the caller formats as empty still takes its line and stays aligned.
const axisTickClassName = "h-4 text-right text-caption text-text-subtle";
const plotClassName = "relative h-37.5";
const gridLineClassName = "absolute inset-x-0 h-px bg-border";
// Positioned, so the bars paint over the absolutely positioned grid lines instead of under them.
const barsRowClassName = "relative flex h-full items-end gap-2.75";
const barClassName = "w-5 rounded-t-sm bg-data";
const labelsContainerClassName = "flex min-h-4 gap-2.75 pr-19";
const labelColumnClassName = "flex w-5 justify-center";
// shrink-0, because a flex item with overflow hidden otherwise gets a min-width of 0, letting the
// 20px column win over max-w before the truncation cap ever applies.
const labelTextClassName = "max-w-43 shrink-0 truncate text-caption text-text-subtle";
const emptyMessageClassName = "text-caption text-text-subtle";
const announcedListClassName = "sr-only";
const announcedPartClassName = "block";

function roundUpToNiceStep(value: number): number {
  if (value <= 0) {
    return 0;
  }
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const niceNormalized = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return niceNormalized * magnitude;
}

function isPlottableValue(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && Number.isFinite(roundUpToNiceStep(value / 5) * 5);
}

function plottableTopTick(bars: ColumnChartBar[]): number | undefined {
  const plottable = bars.map((bar) => bar.value).filter(isPlottableValue);
  const highest = Math.max(0, ...plottable);
  const topTick = roundUpToNiceStep(highest / 5) * 5;
  return topTick > 0 ? topTick : undefined;
}

function tickValues(topTick: number): number[] {
  return Array.from({ length: TICK_COUNT }, (_, index) => (topTick * (TICK_COUNT - 1 - index)) / 5);
}

function barHeightPx(value: number, topTick: number | undefined): number {
  if (topTick === undefined || !isPlottableValue(value)) {
    return 0;
  }
  return (value / topTick) * PLOT_HEIGHT_PX;
}

export function ColumnChart({ bars, formatValue, emptyMessage }: ColumnChartProps) {
  if (bars.length === 0) {
    return <p className={`${chartBoxClassName} ${emptyMessageClassName}`}>{emptyMessage}</p>;
  }

  const topTick = plottableTopTick(bars);
  const ticks = tickValues(topTick ?? MINIMUM_TOP_TICK);

  return (
    <div className={`${chartBoxClassName} ${chartWidthClassName}`}>
      <div aria-hidden="true" className={visualGridClassName}>
        <div className={axisColumnClassName}>
          {ticks.map((tick, index) => (
            <span key={rowTopClassName[index]} className={axisTickClassName}>
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
        <div />
        <div className={labelsContainerClassName}>
          {bars.map((bar) => (
            <div key={bar.id} className={labelColumnClassName}>
              <span className={labelTextClassName}>{bar.label}</span>
            </div>
          ))}
        </div>
      </div>
      <ul className={announcedListClassName}>
        {bars.map((bar) => (
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
