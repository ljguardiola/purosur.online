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

function axisPlotRow(screen: Screen): HTMLElement {
  return visualWrapper(screen).children[0] as HTMLElement;
}

function axisColumn(screen: Screen): HTMLElement {
  return axisPlotRow(screen).children[0] as HTMLElement;
}

function plotArea(screen: Screen): HTMLElement {
  return axisPlotRow(screen).children[1] as HTMLElement;
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

function labelRow(screen: Screen): HTMLElement {
  return visualWrapper(screen).children[1] as HTMLElement;
}

function labelColumns(screen: Screen): HTMLElement[] {
  return Array.from(at(Array.from(labelRow(screen).children), 1).children) as HTMLElement[];
}

function pageBackgroundHex(): string {
  return rgbToHex(getComputedStyle(document.body).backgroundColor);
}

const weekBars: ColumnChartBar[] = [
  { id: "monday", label: "Monday", value: 214300 },
  { id: "tuesday", value: 90000 },
  { id: "wednesday", value: 150000 },
  { id: "thursday", label: "Thursday", value: 60000 },
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
  const ticks = Array.from(axis.children) as HTMLElement[];
  expect(ticks.map((tick) => tick.textContent)).toEqual(expectedTicks);

  for (const tick of ticks) {
    expect(getComputedStyle(tick).fontSize).toBe("12px");
    expect(getComputedStyle(tick).fontWeight).toBe("400");
    expect(getComputedStyle(tick).textAlign).toBe("right");

    const contrast = contrastRatio(rgbToHex(getComputedStyle(tick).color), pageBackgroundHex());
    expect(contrast).toBeGreaterThanOrEqual(AAA_TEXT_CONTRAST);
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

  await expect.element(screen.getByText("$250,000")).toBeInTheDocument();
  await expect.element(screen.getByText("$200,000")).toBeInTheDocument();
  await expect.element(screen.getByText("$150,000")).toBeInTheDocument();
  await expect.element(screen.getByText("$100,000")).toBeInTheDocument();
  await expect.element(screen.getByText("$50,000")).toBeInTheDocument();
  await expect.element(screen.getByText("$0")).toBeInTheDocument();

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

  await expect.element(screen.getByText("$2,500")).toBeInTheDocument();
  await expect.element(screen.getByText("$2,000")).toBeInTheDocument();
  await expect.element(screen.getByText("$1,500")).toBeInTheDocument();
  await expect.element(screen.getByText("$1,000")).toBeInTheDocument();
  await expect.element(screen.getByText("$500")).toBeInTheDocument();
  await expect.element(screen.getByText("$0")).toBeInTheDocument();

  await expectNoAccessibilityViolations(screen.container);
});

test("renders each bar's own label centered underneath it, meeting text contrast", async () => {
  const screen = await render(
    <ColumnChart bars={weekBars} formatValue={formatCurrency} emptyMessage="No data" />,
  );
  const bars = chartBars(screen);
  const monday = screen.getByText("Monday").element() as HTMLElement;
  const thursday = screen.getByText("Thursday").element() as HTMLElement;

  expect(getComputedStyle(monday).fontSize).toBe("12px");
  expect(getComputedStyle(monday).fontWeight).toBe("400");
  const contrast = contrastRatio(rgbToHex(getComputedStyle(monday).color), pageBackgroundHex());
  expect(contrast).toBeGreaterThanOrEqual(AAA_TEXT_CONTRAST);

  const mondayBarRect = at(bars, 0).getBoundingClientRect();
  const mondayLabelRect = monday.getBoundingClientRect();
  const mondayCenter = (mondayBarRect.left + mondayBarRect.right) / 2;
  const mondayLabelCenter = (mondayLabelRect.left + mondayLabelRect.right) / 2;
  expect(mondayLabelCenter).toBeCloseTo(mondayCenter, 0);
  expect(mondayLabelRect.top - mondayBarRect.bottom).toBeGreaterThanOrEqual(5);

  const thursdayBarRect = at(bars, 3).getBoundingClientRect();
  const thursdayLabelRect = thursday.getBoundingClientRect();
  const thursdayCenter = (thursdayBarRect.left + thursdayBarRect.right) / 2;
  const thursdayLabelCenter = (thursdayLabelRect.left + thursdayLabelRect.right) / 2;
  expect(thursdayLabelCenter).toBeCloseTo(thursdayCenter, 0);

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
  expect(at(columns, 0).textContent).toBe("Monday");
  expect(at(columns, 3).textContent).toBe("Thursday");

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

test("announces each bar's label and formatted value to assistive technology", async () => {
  const screen = await render(
    <ColumnChart bars={weekBars} formatValue={formatCurrency} emptyMessage="No data" />,
  );

  await expect
    .element(screen.getByRole("listitem", { name: "Monday: $214,300" }))
    .toBeInTheDocument();
  await expect
    .element(screen.getByRole("listitem", { name: "Thursday: $60,000" }))
    .toBeInTheDocument();

  await expectNoAccessibilityViolations(screen.container);
});

test("announces a bar's formatted value alone when it has no label", async () => {
  const screen = await render(
    <ColumnChart bars={weekBars} formatValue={formatCurrency} emptyMessage="No data" />,
  );

  await expect.element(screen.getByRole("listitem", { name: "$90,000" })).toBeInTheDocument();
  await expect.element(screen.getByRole("listitem", { name: "$150,000" })).toBeInTheDocument();

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
    { id: "monday", label: "Lun 17/08", value: 100 },
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

test("does not collide the axis ticks, and still renders sensibly, when every bar is 0", async () => {
  const bars: ColumnChartBar[] = [
    { id: "a", label: "a", value: 0 },
    { id: "b", label: "b", value: 0 },
  ];

  const { screen, warnings } = await collectKeyWarnings(() =>
    render(<ColumnChart bars={bars} formatValue={formatCurrency} emptyMessage="No data" />),
  );

  expect(warnings).toEqual([]);

  const ticks = Array.from(axisColumn(screen).children) as HTMLElement[];
  expect(ticks).toHaveLength(6);
  expect(ticks.every((tick) => tick.textContent === "$0")).toBe(true);

  for (const bar of chartBars(screen)) {
    expect(bar.getBoundingClientRect().height).toBeCloseTo(0, 0);
    expect(bar.style.height).not.toContain("NaN");
  }

  await expectNoAccessibilityViolations(screen.container);
});

test("does not accept a bar without an id", () => {
  expectTypeOf<{ label?: string; value: number }>().not.toExtend<ColumnChartBar>();
});
