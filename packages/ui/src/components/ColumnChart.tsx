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
const chartBoxClassName = "pt-2";
// The chart's box has to hold what it draws, so it never falls below the width its bars need.
const chartWidthClassName = "w-max min-w-full";
// The axis column and the labels' spacer share the first track, so an axis that grows to fit a
// wide tick moves the labels by exactly as much as the bars.
const visualGridClassName =
  "grid grid-cols-[minmax(4rem,max-content)_minmax(0,1fr)] gap-x-3 gap-y-1.5";
// The ticks stay in flow, so the widest one sets the column's width; the chart is never narrower
// than its content, so the track always reaches that width and no tick wraps. Each tick's 16px
// line box is centered on its grid line, so the column is the 150px plot plus half a line box
// above and below, pulled out by that half on each side so the row stays as tall as the plot.
const axisColumnClassName = "-my-2 flex h-[166px] flex-col justify-between";
// A fixed height, so a tick the caller formats as empty still takes its line and leaves the others
// on theirs.
const axisTickClassName = "h-4 text-right text-xs font-normal text-ink-secondary";
const plotClassName = "relative h-[150px]";
const gridLineClassName = "absolute inset-x-0 h-px bg-line";
// Positioned, so the bars paint over the absolutely positioned grid lines instead of under them.
const barsRowClassName = "relative flex h-full items-end gap-[11px]";
const barClassName = "w-5 rounded-t-[4px] bg-brand-blue-ui";
// The zero tick's line box is centered on the bottom grid line, so half of it sits below the plot;
// the labels keep a label's line of height with no labels in them to hold that half.
//
// The first bar's centre has at least 86px of room to the chart's left edge (axis at least 64 +
// gap 12 + half the bar's own 20px width). The labels reserve the same room past the last bar's
// centre, 76px beyond its own half, so the chart's intrinsic width holds a label at its cap on
// either end; the plot grows into that room, so the grid lines still span the whole box.
const labelsContainerClassName = "flex min-h-4 gap-[11px] pr-[76px]";
const labelColumnClassName = "flex w-5 justify-center";
// A label wider than 172px (twice the least room described above) is shortened with an
// ellipsis instead of overflowing the chart. shrink-0 keeps it from being crushed to the 20px
// column first: a flex item with overflow hidden otherwise gets a min-width of 0, which would
// let the column win before the cap ever applied.
const labelTextClassName = "max-w-[172px] shrink-0 truncate text-xs font-normal text-ink-secondary";
const emptyMessageClassName = "text-xs font-normal text-ink-secondary";
const announcedListClassName = "sr-only";
const announcedPartClassName = "block";

// Rounds a raw interval up to the next "nice" number of the form 1, 2 or 5 times a power of ten,
// the way a chart library picks round axis steps instead of an arbitrary one.
function roundUpToNiceStep(value: number): number {
  if (value <= 0) {
    return 0;
  }
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const niceNormalized = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return niceNormalized * magnitude;
}

// A value is plottable when a bar can be drawn for it: it has to be a real height, and the scale
// that would hold it has to be a real number too, which rounding up overflows for a value near
// the largest one there is.
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
