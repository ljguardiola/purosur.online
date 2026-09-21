import { expect, expectTypeOf, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { AAA_TEXT_CONTRAST, contrastRatio, NON_TEXT_CONTRAST } from "../styles/contrast";
import { expectNoAccessibilityViolations } from "../test/axe";
import { rgbToHex, tokenRgb } from "../test/token-colors";
import { ColumnChart, type ColumnChartBar } from "./ColumnChart";

type Screen = Awaited<ReturnType<typeof render>>;

// A small typed helper, the same shape as Toggle.test.tsx's own DOM-part helpers: it turns a
// possibly-out-of-bounds index into a guaranteed value or a clear failure, instead of scattering
// non-null assertions across every test that reaches into a rendered list by position.
function at<T>(array: readonly T[], index: number): T {
  const item = array[index];
  if (item === undefined) {
    throw new Error(`Expected an item at index ${index}, got undefined`);
  }
  return item;
}

function chartRoot(screen: Screen): HTMLElement {
  return screen.container.firstElementChild as HTMLElement;
}

function visualWrapper(screen: Screen): HTMLElement {
  return chartRoot(screen).children[0] as HTMLElement;
}

// The axis column, the plot, the label row's spacer and the labels container are the four direct
// children of the shared grid (visualWrapper itself), in that order: the grid's implicit
// row-major auto-placement puts the axis column and the plot in row 1, the spacer and the labels
// container in row 2, sharing the axis column's own track.
function axisColumn(screen: Screen): HTMLElement {
  return visualWrapper(screen).children[0] as HTMLElement;
}

function plotArea(screen: Screen): HTMLElement {
  return visualWrapper(screen).children[1] as HTMLElement;
}

function gridLines(screen: Screen): HTMLElement[] {
  return Array.from(plotArea(screen).children).slice(0, 6) as HTMLElement[];
}

function barsRow(screen: Screen): HTMLElement {
  return plotArea(screen).children[6] as HTMLElement;
}

function chartBars(screen: Screen): HTMLElement[] {
  return Array.from(barsRow(screen).children) as HTMLElement[];
}

function labelsContainer(screen: Screen): HTMLElement {
  return visualWrapper(screen).children[3] as HTMLElement;
}

function labelColumns(screen: Screen): HTMLElement[] {
  return Array.from(labelsContainer(screen).children) as HTMLElement[];
}

function axisTicks(screen: Screen): HTMLElement[] {
  return Array.from(axisColumn(screen).children) as HTMLElement[];
}

// A range over an element's contents measures the text run itself, not the box that holds it.
function textRunRect(element: HTMLElement): DOMRect {
  const range = document.createRange();
  range.selectNodeContents(element);
  return range.getBoundingClientRect();
}

function textRunLineCount(element: HTMLElement): number {
  const range = document.createRange();
  range.selectNodeContents(element);
  return range.getClientRects().length;
}

function labelText(screen: Screen, index: number): HTMLElement {
  return at(labelColumns(screen), index).children[0] as HTMLElement;
}

function announcedItems(screen: Screen): HTMLElement[] {
  return Array.from(screen.container.querySelectorAll("li"));
}

function announcedParts(item: HTMLElement): (string | null)[] {
  return Array.from(item.children).map((part) => part.textContent);
}

function pageBackgroundHex(): string {
  return rgbToHex(getComputedStyle(document.body).backgroundColor);
}

// axis 64 + gap 12 + half a bar's own 20px width (10) = at least 86: the room a label has on the
// left of the first bar's centre (the axis only ever grows past its 64px floor, so this is a
// floor on the room too), and the room the chart reserves on the right of the last bar's centre.
// A label is capped at twice that, 86px on each side of its own bar's centre, and shortened past it.
const LABEL_MAX_WIDTH_PX = 172;
const CHART_RIGHT_RESERVE_PX = 76;

// Renders text with the label's own font, outside the chart and unclamped, to read the width it
// would naturally want — the same measurement the chart's own max-width then caps or leaves alone.
function measureNaturalWidth(text: string): number {
  const probe = document.createElement("span");
  probe.className = "text-xs font-normal whitespace-nowrap";
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  probe.textContent = text;
  document.body.appendChild(probe);
  const width = probe.getBoundingClientRect().width;
  probe.remove();
  return width;
}

// Grows label text word by word, then character by character, stopping just under a target
// natural width — the closest this font can land on the label cap without crossing it.
function buildLabelAtWidth(targetPx: number): string {
  const word = "Boundary label ";
  const character = "x";
  let text = "";
  while (measureNaturalWidth(text + word) <= targetPx) {
    text += word;
  }
  while (measureNaturalWidth(text + character) <= targetPx) {
    text += character;
  }
  return text;
}

// One bar at each position that matters for the label cap: right against the chart's left edge,
// somewhere in the middle with room to spare, and right against the chart's reserved right edge.
function threeBars(label: string): ColumnChartBar[] {
  return [
    { id: "first", label, value: 100 },
    { id: "middle", label, value: 80 },
    { id: "last", label, value: 60 },
  ];
}

function expectLabelCenteredOnBar(labelRect: DOMRect, barRect: DOMRect): void {
  expect((labelRect.left + labelRect.right) / 2).toBeCloseTo((barRect.left + barRect.right) / 2, 0);
}

function expectInsideChartBox(rect: DOMRect, rootRect: DOMRect): void {
  expect(rect.top).toBeGreaterThanOrEqual(rootRect.top);
  expect(rect.bottom).toBeLessThanOrEqual(rootRect.bottom);
  expect(rect.left).toBeGreaterThanOrEqual(rootRect.left - 0.5);
  expect(rect.right).toBeLessThanOrEqual(rootRect.right + 0.5);
}

const weekBars: ColumnChartBar[] = [
  { id: "monday", label: "Mon 08/17", value: 214300 },
  { id: "tuesday", value: 90000 },
  { id: "wednesday", value: 150000 },
  { id: "thursday", label: "Thu 08/20", value: 60000 },
];

const formatCurrency = (value: number) => `$${value.toLocaleString("en-US")}`;

test("renders each bar 20px wide, top-radiused, blue, about 11px apart, meeting non-text contrast", async () => {
  const screen = await render(
    <ColumnChart bars={weekBars} formatValue={formatCurrency} emptyMessage="No data" />,
  );
  const bars = chartBars(screen);

  expect(bars).toHaveLength(4);

  for (const bar of bars) {
    const rect = bar.getBoundingClientRect();
    expect(rect.width).toBeCloseTo(20, 0);
    expect(getComputedStyle(bar).backgroundColor).toBe(tokenRgb("brand-blue-ui"));
    expect(getComputedStyle(bar).borderTopLeftRadius).toBe("4px");
    expect(getComputedStyle(bar).borderTopRightRadius).toBe("4px");
    expect(getComputedStyle(bar).borderBottomLeftRadius).toBe("0px");
    expect(getComputedStyle(bar).borderBottomRightRadius).toBe("0px");

    const contrast = contrastRatio(
      rgbToHex(getComputedStyle(bar).backgroundColor),
      pageBackgroundHex(),
    );
    expect(contrast).toBeGreaterThanOrEqual(NON_TEXT_CONTRAST);
  }

  for (let i = 1; i < bars.length; i++) {
    const gap =
      at(bars, i).getBoundingClientRect().left - at(bars, i - 1).getBoundingClientRect().right;
    expect(gap).toBeCloseTo(11, 0);
  }

  await expectNoAccessibilityViolations(screen.container);
});

test("keeps every bar 20px wide, over its own label, in a container narrower than the chart needs", async () => {
  const bars: ColumnChartBar[] = Array.from({ length: 12 }, (_, index) => ({
    id: `day-${index}`,
    label: `Day ${index}`,
    value: 1000,
  }));
  const screen = await render(
    <ColumnChart bars={bars} formatValue={formatCurrency} emptyMessage="No data" />,
  );
  screen.container.style.width = "200px";

  const rendered = chartBars(screen);
  const columns = labelColumns(screen);
  expect(chartRoot(screen).getBoundingClientRect().width).toBeGreaterThan(200);
  expect(rendered).toHaveLength(12);
  expect(columns).toHaveLength(12);

  for (let i = 0; i < rendered.length; i++) {
    const barRect = at(rendered, i).getBoundingClientRect();
    const columnRect = at(columns, i).getBoundingClientRect();
    expect(barRect.width).toBeCloseTo(20, 0);
    expect((barRect.left + barRect.right) / 2).toBeCloseTo(
      (columnRect.left + columnRect.right) / 2,
      0,
    );
  }

  await expectNoAccessibilityViolations(screen.container);
});

test("keeps the value axis 64px wide, with every bar over its label, in a container narrower than it", async () => {
  const bars: ColumnChartBar[] = [
    { id: "a", label: "1", value: 100 },
    { id: "b", label: "2", value: 50 },
    { id: "c", label: "3", value: 75 },
  ];
  const screen = await render(
    <ColumnChart bars={bars} formatValue={formatCurrency} emptyMessage="No data" />,
  );
  screen.container.style.width = "50px";

  const rendered = chartBars(screen);
  const columns = labelColumns(screen);
  expect(chartRoot(screen).getBoundingClientRect().width).toBeGreaterThan(50);
  expect(axisColumn(screen).getBoundingClientRect().width).toBeCloseTo(64, 0);

  for (let i = 0; i < rendered.length; i++) {
    const barRect = at(rendered, i).getBoundingClientRect();
    const columnRect = at(columns, i).getBoundingClientRect();
    expect((barRect.left + barRect.right) / 2).toBeCloseTo(
      (columnRect.left + columnRect.right) / 2,
      0,
    );
  }

  await expectNoAccessibilityViolations(screen.container);
});

test("scales each bar's height to its value against the top tick, sitting on the zero line", async () => {
  const bars: ColumnChartBar[] = [
    { id: "a", value: 214300 },
    { id: "b", value: 107150 },
    { id: "c", value: 0 },
  ];
  const screen = await render(
    <ColumnChart bars={bars} formatValue={formatCurrency} emptyMessage="No data" />,
  );
  const rendered = chartBars(screen);
  const plotRect = plotArea(screen).getBoundingClientRect();

  // topTick for a highest of 214300 is 250000 (see the rounding test below).
  expect(at(rendered, 0).getBoundingClientRect().height).toBeCloseTo((214300 / 250000) * 150, 0);
  expect(at(rendered, 1).getBoundingClientRect().height).toBeCloseTo((107150 / 250000) * 150, 0);
  expect(at(rendered, 2).getBoundingClientRect().height).toBeCloseTo(0, 0);

  for (const bar of rendered) {
    expect(bar.getBoundingClientRect().bottom).toBeCloseTo(plotRect.bottom, 0);
  }

  await expectNoAccessibilityViolations(screen.container);
});

test("leaves the other bars and the axis intact when one bar's value is NaN", async () => {
  const bars: ColumnChartBar[] = [
    { id: "a", value: Number.NaN },
    { id: "b", value: 100 },
  ];
  const screen = await render(
    <ColumnChart bars={bars} formatValue={formatCurrency} emptyMessage="No data" />,
  );
  const ticks = axisTicks(screen);
  const rendered = chartBars(screen);

  expect(ticks.map((tick) => tick.textContent)).toEqual(["$100", "$80", "$60", "$40", "$20", "$0"]);
  expect(at(rendered, 0).getBoundingClientRect().height).toBeCloseTo(0, 0);
  expect(at(rendered, 0).style.height).toBe("0px");
  expect(at(rendered, 1).getBoundingClientRect().height).toBeCloseTo(150, 0);
  expect(announcedItems(screen).map((item) => item.textContent)).toEqual(["$NaN", "$100"]);

  await expectNoAccessibilityViolations(screen.container);
});

test("leaves the other bars and the axis intact when one bar's value is positive infinity", async () => {
  const bars: ColumnChartBar[] = [
    { id: "a", value: Number.POSITIVE_INFINITY },
    { id: "b", value: 100 },
  ];
  const screen = await render(
    <ColumnChart bars={bars} formatValue={formatCurrency} emptyMessage="No data" />,
  );
  const ticks = axisTicks(screen);
  const rendered = chartBars(screen);

  expect(ticks.map((tick) => tick.textContent)).toEqual(["$100", "$80", "$60", "$40", "$20", "$0"]);
  expect(at(rendered, 0).getBoundingClientRect().height).toBeCloseTo(0, 0);
  expect(at(rendered, 0).style.height).toBe("0px");
  expect(at(rendered, 1).getBoundingClientRect().height).toBeCloseTo(150, 0);
  expect(announcedItems(screen).map((item) => item.textContent)).toEqual(["$∞", "$100"]);

  await expectNoAccessibilityViolations(screen.container);
});

test("leaves the other bars and the axis intact when one bar's value is negative infinity", async () => {
  const bars: ColumnChartBar[] = [
    { id: "a", value: Number.NEGATIVE_INFINITY },
    { id: "b", value: 100 },
  ];
  const screen = await render(
    <ColumnChart bars={bars} formatValue={formatCurrency} emptyMessage="No data" />,
  );
  const ticks = axisTicks(screen);
  const rendered = chartBars(screen);

  expect(ticks.map((tick) => tick.textContent)).toEqual(["$100", "$80", "$60", "$40", "$20", "$0"]);
  expect(at(rendered, 0).getBoundingClientRect().height).toBeCloseTo(0, 0);
  expect(at(rendered, 0).style.height).toBe("0px");
  expect(at(rendered, 1).getBoundingClientRect().height).toBeCloseTo(150, 0);
  expect(announcedItems(screen).map((item) => item.textContent)).toEqual(["$-∞", "$100"]);

  await expectNoAccessibilityViolations(screen.container);
});

test("draws nothing for a bar with a negative value, and still announces it", async () => {
  const bars: ColumnChartBar[] = [
    { id: "a", value: 100 },
    { id: "b", value: -50 },
  ];
  const screen = await render(
    <ColumnChart bars={bars} formatValue={formatCurrency} emptyMessage="No data" />,
  );
  const rendered = chartBars(screen);

  expect(at(rendered, 0).getBoundingClientRect().height).toBeCloseTo(150, 0);
  expect(at(rendered, 1).getBoundingClientRect().height).toBeCloseTo(0, 0);
  expect(at(rendered, 1).style.height).toBe("0px");
  expect(announcedItems(screen).map((item) => item.textContent)).toEqual(["$100", "$-50"]);

  await expectNoAccessibilityViolations(screen.container);
});

test("leaves the other bars and the axis intact when one value is too large to round onto a scale", async () => {
  const bars: ColumnChartBar[] = [
    { id: "a", value: Number.MAX_VALUE },
    { id: "b", value: 100 },
  ];
  const screen = await render(
    <ColumnChart bars={bars} formatValue={formatCurrency} emptyMessage="No data" />,
  );
  const ticks = axisTicks(screen);
  const rendered = chartBars(screen);

  expect(ticks.map((tick) => tick.textContent)).toEqual(["$100", "$80", "$60", "$40", "$20", "$0"]);

  expect(at(rendered, 0).style.height).toBe("0px");
  expect(at(rendered, 1).getBoundingClientRect().height).toBeCloseTo(150, 0);
  expect(announcedItems(screen)).toHaveLength(2);

  await expectNoAccessibilityViolations(screen.container);
});

test("falls back to the minimum scale when no value at all can be drawn", async () => {
  const bars: ColumnChartBar[] = [
    { id: "a", value: Number.MAX_VALUE },
    { id: "b", value: Number.NaN },
  ];
  const screen = await render(
    <ColumnChart bars={bars} formatValue={formatCurrency} emptyMessage="No data" />,
  );
  const ticks = axisTicks(screen);

  expect(ticks.map((tick) => tick.textContent)).toEqual([
    "$1,000",
    "$800",
    "$600",
    "$400",
    "$200",
    "$0",
  ]);

  for (const bar of chartBars(screen)) {
    expect(bar.style.height).toBe("0px");
  }

  await expectNoAccessibilityViolations(screen.container);
});

test("renders 6 full-width, 1px grid lines in the line color, evenly spaced across the 150px plot", async () => {
  const screen = await render(
    <ColumnChart bars={weekBars} formatValue={formatCurrency} emptyMessage="No data" />,
  );
  const lines = gridLines(screen);
  const plotRect = plotArea(screen).getBoundingClientRect();

  expect(lines).toHaveLength(6);

  const tops = lines.map((line) => line.getBoundingClientRect().top - plotRect.top);
  const sortedTops = [...tops].sort((a, b) => a - b);
  expect(sortedTops[0]).toBeCloseTo(0, 0);
  expect(sortedTops[5]).toBeCloseTo(150, 0);

  for (let i = 1; i < sortedTops.length; i++) {
    expect(at(sortedTops, i) - at(sortedTops, i - 1)).toBeCloseTo(30, 0);
  }

  for (const line of lines) {
    const rect = line.getBoundingClientRect();
    expect(rect.height).toBeCloseTo(1, 0);
    expect(rect.width).toBeCloseTo(plotRect.width, 0);
    expect(getComputedStyle(line).backgroundColor).toBe(tokenRgb("line"));
  }

  await expectNoAccessibilityViolations(screen.container);
});

test("draws the bars over the grid lines, not under them", async () => {
  const screen = await render(
    <ColumnChart
      bars={[{ id: "a", label: "1", value: 1000 }]}
      formatValue={formatCurrency}
      emptyMessage="No data"
    />,
  );
  const bar = at(chartBars(screen), 0);
  const barRect = bar.getBoundingClientRect();
  const crossedLine = at(gridLines(screen), 3);
  const lineRect = crossedLine.getBoundingClientRect();

  expect(lineRect.top).toBeGreaterThan(barRect.top);
  expect(lineRect.top).toBeLessThan(barRect.bottom);
  expect(document.elementFromPoint(barRect.left + barRect.width / 2, lineRect.top + 0.5)).toBe(bar);

  await expectNoAccessibilityViolations(screen.container);
});

test("renders a 64px right-aligned value axis with a tick per grid line, formatted by the caller, meeting text contrast", async () => {
  const screen = await render(
    <ColumnChart bars={weekBars} formatValue={formatCurrency} emptyMessage="No data" />,
  );
  const axis = axisColumn(screen);
  const axisRect = axis.getBoundingClientRect();
  const plotRect = plotArea(screen).getBoundingClientRect();

  expect(axisRect.width).toBeCloseTo(64, 0);
  expect(plotRect.left - axisRect.right).toBeCloseTo(12, 0);

  const expectedTicks = ["$250,000", "$200,000", "$150,000", "$100,000", "$50,000", "$0"];
  const ticks = axisTicks(screen);
  expect(ticks.map((tick) => tick.textContent)).toEqual(expectedTicks);

  for (const tick of ticks) {
    expect(getComputedStyle(tick).fontSize).toBe("12px");
    expect(getComputedStyle(tick).fontWeight).toBe("400");
    expect(getComputedStyle(tick).textAlign).toBe("right");

    const contrast = contrastRatio(rgbToHex(getComputedStyle(tick).color), pageBackgroundHex());
    expect(contrast).toBeGreaterThanOrEqual(AAA_TEXT_CONTRAST);
  }

  const lines = gridLines(screen);
  for (let i = 0; i < ticks.length; i++) {
    const tickRect = textRunRect(at(ticks, i));
    expect((tickRect.top + tickRect.bottom) / 2, expectedTicks[i]).toBeCloseTo(
      at(lines, i).getBoundingClientRect().top,
      0,
    );
  }

  await expectNoAccessibilityViolations(screen.container);
});

// Finds the tick whose text is the widest, the way the browser's own grid track sizing does when
// it grows the axis column to fit its content.
function widestTick(ticks: HTMLElement[]): HTMLElement {
  return ticks.reduce((widest, tick) =>
    measureNaturalWidth(tick.textContent ?? "") >= measureNaturalWidth(widest.textContent ?? "")
      ? tick
      : widest,
  );
}

test("keeps every tick whole, on one line, right-aligned in the unchanged 64px axis, when every tick fits", async () => {
  const screen = await render(
    <ColumnChart bars={weekBars} formatValue={formatCurrency} emptyMessage="No data" />,
  );

  for (const containerWidth of ["1px", "2000px"]) {
    screen.container.style.width = containerWidth;
    const rootRect = chartRoot(screen).getBoundingClientRect();
    const axisRect = axisColumn(screen).getBoundingClientRect();
    const plotRect = plotArea(screen).getBoundingClientRect();

    expect(axisRect.width).toBeCloseTo(64, 0);
    expect(plotRect.left - axisRect.right).toBeCloseTo(12, 0);

    for (const tick of axisTicks(screen)) {
      const runRect = textRunRect(tick);
      const naturalWidth = measureNaturalWidth(tick.textContent ?? "");

      expect(textRunLineCount(tick)).toBe(1);
      expect(runRect.width).toBeCloseTo(naturalWidth, 0);
      expect(runRect.right).toBeCloseTo(axisRect.right, 0);
      expect(runRect.left).toBeGreaterThanOrEqual(rootRect.left - 0.5);
    }
  }

  const items = announcedItems(screen);
  expect(items).toHaveLength(weekBars.length);
  expect(announcedParts(at(items, 0))).toEqual(["Mon 08/17", "$214,300"]);
  expect(announcedParts(at(items, 3))).toEqual(["Thu 08/20", "$60,000"]);

  await expectNoAccessibilityViolations(screen.container);
});

test("keeps the axis at its 64px floor when every tick's natural width sits right at that boundary", async () => {
  const boundaryText = buildLabelAtWidth(64);
  const formatAtBoundary = () => boundaryText;
  const screen = await render(
    <ColumnChart bars={weekBars} formatValue={formatAtBoundary} emptyMessage="No data" />,
  );
  const axisRect = axisColumn(screen).getBoundingClientRect();
  const plotRect = plotArea(screen).getBoundingClientRect();
  const naturalWidth = measureNaturalWidth(boundaryText);

  expect(axisRect.width).toBeCloseTo(64, 0);
  expect(plotRect.left - axisRect.right).toBeCloseTo(12, 0);

  for (const tick of axisTicks(screen)) {
    const runRect = textRunRect(tick);

    expect(textRunLineCount(tick)).toBe(1);
    expect(runRect.width).toBeCloseTo(naturalWidth, 0);
    expect(runRect.right).toBeCloseTo(axisRect.right, 0);
  }

  await expectNoAccessibilityViolations(screen.container);
});

test("grows the axis to its widest tick for a value far too wide, keeping every tick whole, right-aligned and off the plot", async () => {
  const bars: ColumnChartBar[] = [{ id: "a", label: "Total", value: 21_430_000_000 }];
  const wideScreen = await render(
    <ColumnChart bars={bars} formatValue={formatCurrency} emptyMessage="No data" />,
  );
  // Renders the same numeric ticks with a constant, short label, so the difference between the
  // two charts' intrinsic widths is exactly the extra room the wide formatter's axis grew by.
  const shortScreen = await render(
    <ColumnChart bars={bars} formatValue={() => "$0"} emptyMessage="No data" />,
  );

  for (const containerWidth of ["1px", "2000px"]) {
    wideScreen.container.style.width = containerWidth;

    const rootRect = chartRoot(wideScreen).getBoundingClientRect();
    const axisRect = axisColumn(wideScreen).getBoundingClientRect();
    const plotRect = plotArea(wideScreen).getBoundingClientRect();
    const firstBarRect = at(chartBars(wideScreen), 0).getBoundingClientRect();
    const ticks = axisTicks(wideScreen);
    const naturalWidths = ticks.map((tick) => measureNaturalWidth(tick.textContent ?? ""));

    expect(axisRect.width).toBeGreaterThan(64);
    expect(axisRect.width).toBeCloseTo(Math.max(...naturalWidths), 0);
    expect(plotRect.left - axisRect.right).toBeCloseTo(12, 0);
    expect(textRunRect(widestTick(ticks)).left).toBeGreaterThanOrEqual(rootRect.left - 0.5);

    for (const tick of ticks) {
      const runRect = textRunRect(tick);
      const naturalWidth = measureNaturalWidth(tick.textContent ?? "");

      expect(textRunLineCount(tick)).toBe(1);
      expect(runRect.width).toBeCloseTo(naturalWidth, 0);
      expect(runRect.right).toBeCloseTo(axisRect.right, 0);
      expect(runRect.right).toBeLessThan(firstBarRect.left);
    }

    const rendered = chartBars(wideScreen);
    const columns = labelColumns(wideScreen);
    for (let i = 0; i < rendered.length; i++) {
      const barRect = at(rendered, i).getBoundingClientRect();
      const columnRect = at(columns, i).getBoundingClientRect();
      expect((barRect.left + barRect.right) / 2).toBeCloseTo(
        (columnRect.left + columnRect.right) / 2,
        0,
      );
    }
  }

  wideScreen.container.style.width = "1px";
  shortScreen.container.style.width = "1px";
  const wideRootWidth = chartRoot(wideScreen).getBoundingClientRect().width;
  const shortRootWidth = chartRoot(shortScreen).getBoundingClientRect().width;
  const grownAxisWidth = axisColumn(wideScreen).getBoundingClientRect().width;
  expect(wideRootWidth - shortRootWidth).toBeCloseTo(grownAxisWidth - 64, 0);

  await expectNoAccessibilityViolations(wideScreen.container);
  await expectNoAccessibilityViolations(shortScreen.container);
});

test("keeps a tick that contains a space on one line even though it's far wider than 64px", async () => {
  const formatWithSpaces = (value: number) =>
    `$ ${value.toLocaleString("en-US").replaceAll(",", " ")}`;
  const screen = await render(
    <ColumnChart
      bars={[{ id: "a", value: 21_430_000 }]}
      formatValue={formatWithSpaces}
      emptyMessage="No data"
    />,
  );
  const ticks = axisTicks(screen);
  const widest = widestTick(ticks);

  expect(widest.textContent).toContain(" ");
  expect(measureNaturalWidth(widest.textContent ?? "")).toBeGreaterThan(64);
  for (const tick of ticks) {
    expect(textRunLineCount(tick)).toBe(1);
  }

  await expectNoAccessibilityViolations(screen.container);
});

test("rounds the top tick up to a nice step from the highest bar (214300 -> 250000)", async () => {
  const screen = await render(
    <ColumnChart
      bars={[{ id: "a", value: 214300 }]}
      formatValue={formatCurrency}
      emptyMessage="No data"
    />,
  );

  expect(axisTicks(screen).map((tick) => tick.textContent)).toEqual([
    "$250,000",
    "$200,000",
    "$150,000",
    "$100,000",
    "$50,000",
    "$0",
  ]);

  await expectNoAccessibilityViolations(screen.container);
});

test("rounds the top tick up to a nice step from the highest bar (1200 -> 2500)", async () => {
  const screen = await render(
    <ColumnChart
      bars={[{ id: "a", value: 1200 }]}
      formatValue={formatCurrency}
      emptyMessage="No data"
    />,
  );

  expect(axisTicks(screen).map((tick) => tick.textContent)).toEqual([
    "$2,500",
    "$2,000",
    "$1,500",
    "$1,000",
    "$500",
    "$0",
  ]);

  await expectNoAccessibilityViolations(screen.container);
});

test("centers each bar's own label text on its bar, meeting text contrast", async () => {
  const screen = await render(
    <ColumnChart bars={weekBars} formatValue={formatCurrency} emptyMessage="No data" />,
  );
  const bars = chartBars(screen);
  const monday = labelText(screen, 0);
  const thursday = labelText(screen, 3);

  expect(getComputedStyle(monday).fontSize).toBe("12px");
  expect(getComputedStyle(monday).fontWeight).toBe("400");
  const contrast = contrastRatio(rgbToHex(getComputedStyle(monday).color), pageBackgroundHex());
  expect(contrast).toBeGreaterThanOrEqual(AAA_TEXT_CONTRAST);

  const mondayBarRect = at(bars, 0).getBoundingClientRect();
  const mondayTextRect = textRunRect(monday);
  expect(mondayTextRect.width).toBeGreaterThan(mondayBarRect.width);
  expect((mondayTextRect.left + mondayTextRect.right) / 2).toBeCloseTo(
    (mondayBarRect.left + mondayBarRect.right) / 2,
    0,
  );
  expect(mondayTextRect.top - mondayBarRect.bottom).toBeGreaterThanOrEqual(5);

  const thursdayBarRect = at(bars, 3).getBoundingClientRect();
  const thursdayTextRect = textRunRect(thursday);
  expect((thursdayTextRect.left + thursdayTextRect.right) / 2).toBeCloseTo(
    (thursdayBarRect.left + thursdayBarRect.right) / 2,
    0,
  );

  await expectNoAccessibilityViolations(screen.container);
});

test("keeps a label that contains a space on a single line", async () => {
  const screen = await render(
    <ColumnChart bars={weekBars} formatValue={formatCurrency} emptyMessage="No data" />,
  );
  const monday = labelText(screen, 0);

  expect(textRunLineCount(monday)).toBe(1);
  expect(textRunRect(monday).height).toBeCloseTo(16, 0);

  await expectNoAccessibilityViolations(screen.container);
});

test("paints every axis tick and every label inside its own bounds", async () => {
  // Labels here fit their own column outright; a label wider than the chart's own room is
  // covered by the dedicated cap and shortening tests below.
  const bars: ColumnChartBar[] = [
    { id: "a", label: "1", value: 214300 },
    { id: "b", value: 90000 },
    { id: "c", label: "3", value: 150000 },
    { id: "d", label: "4", value: 60000 },
  ];
  const screen = await render(
    <ColumnChart bars={bars} formatValue={formatCurrency} emptyMessage="No data" />,
  );
  const rootRect = chartRoot(screen).getBoundingClientRect();
  const tickRects = axisTicks(screen).map((tick) => tick.getBoundingClientRect());
  const labelRects = labelColumns(screen).map(textRunRect);

  for (const rect of [...tickRects, ...labelRects]) {
    expect(rect.top).toBeGreaterThanOrEqual(rootRect.top);
    expect(rect.bottom).toBeLessThanOrEqual(rootRect.bottom);
    expect(rect.left).toBeGreaterThanOrEqual(rootRect.left);
    expect(rect.right).toBeLessThanOrEqual(rootRect.right);
  }

  await expectNoAccessibilityViolations(screen.container);
});

test("paints every bar, grid line and tick inside its own box, at any container width", async () => {
  const bars: ColumnChartBar[] = Array.from({ length: 12 }, (_, index) => ({
    id: `day-${index}`,
    // Labels here fit their own column outright; a label wider than the chart's own room is
    // covered by the dedicated cap and shortening tests below.
    label: `${index}`,
    value: 1000,
  }));
  const axisWidth = 64;
  const axisGap = 12;
  const barsWidth = 12 * 20 + 11 * 11;
  // The chart's own intrinsic width includes the room it reserves past the last bar.
  const chartWidth = axisWidth + axisGap + barsWidth + CHART_RIGHT_RESERVE_PX;
  const screen = await render(
    <ColumnChart bars={bars} formatValue={formatCurrency} emptyMessage="No data" />,
  );

  for (const containerWidth of [chartWidth / 2, chartWidth, chartWidth * 2]) {
    screen.container.style.width = `${containerWidth}px`;

    const rootRect = chartRoot(screen).getBoundingClientRect();
    const rendered = chartBars(screen);
    const columns = labelColumns(screen);
    const ticks = axisTicks(screen);

    expect(rootRect.width).toBeCloseTo(Math.max(chartWidth, containerWidth), 0);

    for (const element of [...rendered, ...gridLines(screen), ...ticks]) {
      const rect = element.getBoundingClientRect();
      expect(rect.left).toBeGreaterThanOrEqual(rootRect.left);
      expect(rect.right).toBeLessThanOrEqual(rootRect.right);
      expect(rect.top).toBeGreaterThanOrEqual(rootRect.top);
      expect(rect.bottom).toBeLessThanOrEqual(rootRect.bottom);
    }

    // The room reserved for the last label belongs to the plot too, so no grid line stops short.
    for (const line of gridLines(screen)) {
      expect(line.getBoundingClientRect().right).toBeCloseTo(rootRect.right, 0);
    }

    for (let i = 0; i < rendered.length; i++) {
      const barRect = at(rendered, i).getBoundingClientRect();
      const columnRect = at(columns, i).getBoundingClientRect();
      expect((barRect.left + barRect.right) / 2).toBeCloseTo(
        (columnRect.left + columnRect.right) / 2,
        0,
      );
    }
  }

  await expectNoAccessibilityViolations(screen.container);
});

test("keeps a label that fits unshortened and centered on its own bar, inside the chart box, for the first, an inner and the last bar", async () => {
  const label = "Mon 08/17";
  const bars = threeBars(label);
  const screen = await render(
    <ColumnChart bars={bars} formatValue={formatCurrency} emptyMessage="No data" />,
  );

  for (const containerWidth of ["1px", "2000px"]) {
    screen.container.style.width = containerWidth;
    const rootRect = chartRoot(screen).getBoundingClientRect();
    const rendered = chartBars(screen);

    for (let i = 0; i < bars.length; i++) {
      const span = labelText(screen, i);
      const spanRect = span.getBoundingClientRect();
      const barRect = at(rendered, i).getBoundingClientRect();

      expect(span.textContent).toBe(label);
      expect(span.scrollWidth).toBeLessThanOrEqual(span.clientWidth);
      expectLabelCenteredOnBar(spanRect, barRect);
      expectInsideChartBox(spanRect, rootRect);
    }
  }

  await expectNoAccessibilityViolations(screen.container);
});

test("keeps a label at the 172px cap unshortened, touching the chart's own edge on the first and last bar", async () => {
  const label = buildLabelAtWidth(LABEL_MAX_WIDTH_PX);
  const bars = threeBars(label);
  const screen = await render(
    <ColumnChart bars={bars} formatValue={formatCurrency} emptyMessage="No data" />,
  );
  screen.container.style.width = "1px";

  const rootRect = chartRoot(screen).getBoundingClientRect();
  const rendered = chartBars(screen);
  const firstSpan = labelText(screen, 0);
  const lastSpan = labelText(screen, 2);
  const firstRect = firstSpan.getBoundingClientRect();
  const lastRect = lastSpan.getBoundingClientRect();

  for (const span of [firstSpan, lastSpan]) {
    expect(span.scrollWidth).toBeLessThanOrEqual(span.clientWidth);
  }
  expectLabelCenteredOnBar(firstRect, at(rendered, 0).getBoundingClientRect());
  expectLabelCenteredOnBar(lastRect, at(rendered, 2).getBoundingClientRect());
  expectInsideChartBox(firstRect, rootRect);
  expectInsideChartBox(lastRect, rootRect);
  // The label keeps its whole natural width, and the room it leaves on the side the cap bounds is
  // exactly what that width falls short of the cap.
  const naturalWidth = measureNaturalWidth(label);
  const slack = (LABEL_MAX_WIDTH_PX - naturalWidth) / 2;
  expect(firstRect.width).toBeCloseTo(naturalWidth, 0);
  expect(lastRect.width).toBeCloseTo(naturalWidth, 0);
  expect(firstRect.left - rootRect.left).toBeCloseTo(slack, 0);
  expect(rootRect.right - lastRect.right).toBeCloseTo(slack, 0);

  await expectNoAccessibilityViolations(screen.container);
});

test("shortens a label wider than 172px with an ellipsis, keeping it one line, centered and inside the chart box, and still announces it in full, for the first, an inner and the last bar", async () => {
  const label =
    "A label far too long to fit in the room the chart reserves for it on either side of its bar";
  const bars = threeBars(label);
  const screen = await render(
    <ColumnChart bars={bars} formatValue={formatCurrency} emptyMessage="No data" />,
  );

  for (const containerWidth of ["1px", "2000px"]) {
    screen.container.style.width = containerWidth;
    const rootRect = chartRoot(screen).getBoundingClientRect();
    const rendered = chartBars(screen);

    for (let i = 0; i < bars.length; i++) {
      const span = labelText(screen, i);
      const spanRect = span.getBoundingClientRect();
      const barRect = at(rendered, i).getBoundingClientRect();

      expect(spanRect.width).toBeCloseTo(LABEL_MAX_WIDTH_PX, 0);
      expect(span.scrollWidth).toBeGreaterThan(span.clientWidth);
      expect(getComputedStyle(span).textOverflow).toBe("ellipsis");
      // The text run itself is still wider than the cap: only the box's own clip keeps what
      // spills past it from painting beyond the chart.
      expect(textRunRect(span).width).toBeGreaterThan(LABEL_MAX_WIDTH_PX);
      expect(getComputedStyle(span).overflowX).toBe("hidden");
      expect(spanRect.height).toBeCloseTo(16, 0);
      expectLabelCenteredOnBar(spanRect, barRect);
      expectInsideChartBox(spanRect, rootRect);
    }
  }

  for (const item of announcedItems(screen)) {
    expect(announcedParts(item)[0]).toBe(label);
  }

  await expectNoAccessibilityViolations(screen.container);
});

test("renders no label for a bar that doesn't have one", async () => {
  const screen = await render(
    <ColumnChart bars={weekBars} formatValue={formatCurrency} emptyMessage="No data" />,
  );
  const columns = labelColumns(screen);

  expect(columns).toHaveLength(4);
  expect(at(columns, 1).textContent).toBe("");
  expect(at(columns, 2).textContent).toBe("");
  expect(at(columns, 0).textContent).toBe("Mon 08/17");
  expect(at(columns, 3).textContent).toBe("Thu 08/20");

  await expectNoAccessibilityViolations(screen.container);
});

test("keeps the zero tick inside the chart box, at the same height, when no bar has a label", async () => {
  const unlabeled = weekBars.map(({ id, value }) => ({ id, value }));
  const labelledScreen = await render(
    <ColumnChart bars={weekBars} formatValue={formatCurrency} emptyMessage="No data" />,
  );
  const labelledHeight = chartRoot(labelledScreen).getBoundingClientRect().height;
  const screen = await render(
    <ColumnChart bars={unlabeled} formatValue={formatCurrency} emptyMessage="No data" />,
  );
  const rootRect = chartRoot(screen).getBoundingClientRect();

  expect(rootRect.height).toBeCloseTo(labelledHeight, 0);
  for (const tick of axisTicks(screen)) {
    const rect = textRunRect(tick);
    expect(rect.top).toBeGreaterThanOrEqual(rootRect.top);
    expect(rect.bottom).toBeLessThanOrEqual(rootRect.bottom);
  }

  await expectNoAccessibilityViolations(screen.container);
});

test("renders the empty message instead of the chart when there are no bars", async () => {
  const screen = await render(
    <ColumnChart bars={[]} formatValue={formatCurrency} emptyMessage="No sales yet" />,
  );

  await expect.element(screen.getByText("No sales yet")).toBeInTheDocument();
  expect(screen.container.querySelectorAll("li")).toHaveLength(0);

  await expectNoAccessibilityViolations(screen.container);
});

test("renders the empty message in the same type as the rest of the chart, meeting text contrast", async () => {
  const screen = await render(
    <ColumnChart bars={[]} formatValue={formatCurrency} emptyMessage="No sales yet" />,
  );
  const message = screen.getByText("No sales yet").element() as HTMLElement;

  expect(getComputedStyle(message).fontSize).toBe("12px");
  expect(getComputedStyle(message).fontWeight).toBe("400");
  const contrast = contrastRatio(rgbToHex(getComputedStyle(message).color), pageBackgroundHex());
  expect(contrast).toBeGreaterThanOrEqual(AAA_TEXT_CONTRAST);

  await expectNoAccessibilityViolations(screen.container);
});

test("gives the empty message the same box as the chart it replaces, so swapping doesn't shift it", async () => {
  const empty = await render(
    <ColumnChart bars={[]} formatValue={formatCurrency} emptyMessage="No sales yet" />,
  );
  const populated = await render(
    <ColumnChart bars={weekBars} formatValue={formatCurrency} emptyMessage="No sales yet" />,
  );
  const emptyStyle = getComputedStyle(chartRoot(empty));
  const populatedStyle = getComputedStyle(chartRoot(populated));

  expect(emptyStyle.paddingTop).toBe(populatedStyle.paddingTop);
  expect(emptyStyle.paddingRight).toBe(populatedStyle.paddingRight);
  expect(emptyStyle.paddingBottom).toBe(populatedStyle.paddingBottom);
  expect(emptyStyle.paddingLeft).toBe(populatedStyle.paddingLeft);

  await expectNoAccessibilityViolations(populated.container);
  await expectNoAccessibilityViolations(empty.container);
});

test("announces each bar's label and formatted value to assistive technology", async () => {
  const screen = await render(
    <ColumnChart bars={weekBars} formatValue={formatCurrency} emptyMessage="No data" />,
  );
  const items = announcedItems(screen);

  expect(announcedParts(at(items, 0))).toEqual(["Mon 08/17", "$214,300"]);
  expect(announcedParts(at(items, 3))).toEqual(["Thu 08/20", "$60,000"]);

  await expectNoAccessibilityViolations(screen.container);
});

test("carries each bar's announced text inside its list item, not in an aria-label", async () => {
  const screen = await render(
    <ColumnChart bars={weekBars} formatValue={formatCurrency} emptyMessage="No data" />,
  );
  const items = announcedItems(screen);

  expect(items).toHaveLength(4);
  expect(screen.container.querySelectorAll("li[aria-label]")).toHaveLength(0);
  expect(at(items, 0).textContent).toContain("Mon 08/17");
  expect(at(items, 0).textContent).toContain("$214,300");
  expect(at(items, 1).textContent).toBe("$90,000");

  await expectNoAccessibilityViolations(screen.container);
});

test("announces one item per bar, in order, even when no value can be plotted", async () => {
  const bars: ColumnChartBar[] = [
    { id: "a", label: "1", value: Number.NaN },
    { id: "b", label: "2", value: Number.POSITIVE_INFINITY },
    { id: "c", value: Number.NEGATIVE_INFINITY },
    { id: "d", label: "4", value: -50 },
  ];
  const screen = await render(
    <ColumnChart bars={bars} formatValue={formatCurrency} emptyMessage="No data" />,
  );
  const items = announcedItems(screen);
  const ticks = axisTicks(screen);

  expect(items).toHaveLength(bars.length);
  expect(chartBars(screen)).toHaveLength(bars.length);
  expect(labelColumns(screen)).toHaveLength(bars.length);
  expect(announcedParts(at(items, 0))).toEqual(["1", "$NaN"]);
  expect(announcedParts(at(items, 1))).toEqual(["2", "$∞"]);
  expect(announcedParts(at(items, 2))).toEqual(["$-∞"]);
  expect(announcedParts(at(items, 3))).toEqual(["4", "$-50"]);
  expect(ticks.map((tick) => tick.textContent)).toEqual([
    "$1,000",
    "$800",
    "$600",
    "$400",
    "$200",
    "$0",
  ]);

  for (const bar of chartBars(screen)) {
    expect(bar.style.height).toBe("0px");
  }

  await expectNoAccessibilityViolations(screen.container);
});

test("keeps a bar's announced label and value on their own lines, so they don't read as one word", async () => {
  const screen = await render(
    <ColumnChart bars={weekBars} formatValue={formatCurrency} emptyMessage="No data" />,
  );
  const parts = Array.from(at(announcedItems(screen), 0).children) as HTMLElement[];

  expect(parts).toHaveLength(2);
  for (const part of parts) {
    expect(getComputedStyle(part).display).toBe("block");
  }

  await expectNoAccessibilityViolations(screen.container);
});

test("announces a bar's formatted value alone when it has no label", async () => {
  const screen = await render(
    <ColumnChart bars={weekBars} formatValue={formatCurrency} emptyMessage="No data" />,
  );
  const items = announcedItems(screen);

  expect(announcedParts(at(items, 1))).toEqual(["$90,000"]);
  expect(announcedParts(at(items, 2))).toEqual(["$150,000"]);

  await expectNoAccessibilityViolations(screen.container);
});

// React only logs a duplicate-key warning after the synchronous render commits, so a spy that is
// installed and restored around the render call alone observes nothing: it has to still be
// installed when that later warning fires, which is why this awaits a tick before reading it.
async function collectKeyWarnings(renderChart: () => Promise<Screen>): Promise<{
  screen: Screen;
  warnings: string[];
}> {
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  const screen = await renderChart();
  await new Promise((resolve) => setTimeout(resolve, 50));
  const warnings = spy.mock.calls
    .map((call) => call.map(String).join(" "))
    .filter((message) => message.includes("same key"));
  spy.mockRestore();
  return { screen, warnings };
}

test("does not collide two unlabeled bars that share the same value", async () => {
  const bars: ColumnChartBar[] = [
    { id: "monday", label: "Mon 08/17", value: 100 },
    { id: "tuesday", value: 44 },
    { id: "wednesday", value: 44 },
    { id: "thursday", value: 58 },
    { id: "friday", value: 58 },
  ];

  const { screen, warnings } = await collectKeyWarnings(() =>
    render(<ColumnChart bars={bars} formatValue={formatCurrency} emptyMessage="No data" />),
  );

  expect(warnings).toEqual([]);

  await expectNoAccessibilityViolations(screen.container);
});

test("falls back to a minimum scale, without colliding the axis ticks, when every bar is 0", async () => {
  const bars: ColumnChartBar[] = [
    { id: "a", label: "a", value: 0 },
    { id: "b", label: "b", value: 0 },
  ];

  const { screen, warnings } = await collectKeyWarnings(() =>
    render(<ColumnChart bars={bars} formatValue={formatCurrency} emptyMessage="No data" />),
  );

  expect(warnings).toEqual([]);

  const ticks = axisTicks(screen);
  expect(ticks.map((tick) => tick.textContent)).toEqual([
    "$1,000",
    "$800",
    "$600",
    "$400",
    "$200",
    "$0",
  ]);

  for (const bar of chartBars(screen)) {
    expect(bar.getBoundingClientRect().height).toBeCloseTo(0, 0);
    expect(bar.style.height).toBe("0px");
  }

  await expectNoAccessibilityViolations(screen.container);
});

test("does not accept a bar without an id", () => {
  expectTypeOf<{ label?: string; value: number }>().not.toExtend<ColumnChartBar>();
});
