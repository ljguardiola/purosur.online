import { expect, expectTypeOf, test } from "vitest";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../test/axe";
import { tokenRgb } from "../test/token-colors";
import { SummaryRow, type SummaryRowProps } from "./SummaryRow";

test("renders the label on the left and the value on the right, both 16px, label regular and value semibold, in secondary text", async () => {
  const screen = await render(<SummaryRow label="Subtotal" value="$120.00" />);

  const row = screen.container.firstElementChild as HTMLElement;
  const label = screen.getByText("Subtotal", { exact: true }).element() as HTMLElement;
  const value = screen.getByText("$120.00", { exact: true }).element() as HTMLElement;

  expect(row.firstElementChild).toBe(label);
  expect(row.lastElementChild).toBe(value);
  expect(getComputedStyle(row).display).toBe("flex");
  expect(getComputedStyle(row).justifyContent).toBe("space-between");

  const rowRect = row.getBoundingClientRect();
  const labelRect = label.getBoundingClientRect();
  const valueRect = value.getBoundingClientRect();
  expect(labelRect.right).toBeLessThan(valueRect.left);
  expect(labelRect.left).toBeCloseTo(rowRect.left, 0);
  expect(valueRect.right).toBeCloseTo(rowRect.right, 0);

  expect(getComputedStyle(label).fontSize).toBe("16px");
  expect(getComputedStyle(label).fontWeight).toBe("400");
  expect(getComputedStyle(label).color).toBe(tokenRgb("ink-secondary"));

  expect(getComputedStyle(value).fontSize).toBe("16px");
  expect(getComputedStyle(value).fontWeight).toBe("600");
  expect(getComputedStyle(value).color).toBe(tokenRgb("ink-secondary"));

  await expectNoAccessibilityViolations(screen.container);
});

test("renders no border of its own, leaving the divider to the group that holds it", async () => {
  const screen = await render(<SummaryRow label="Subtotal" value="$120.00" />);
  const row = screen.container.firstElementChild as HTMLElement;
  const style = getComputedStyle(row);

  expect(style.borderTopWidth).toBe("0px");
  expect(style.borderBottomWidth).toBe("0px");

  await expectNoAccessibilityViolations(screen.container);
});

test("renders a strong row's label and value at 18px bold, in ink", async () => {
  const screen = await render(<SummaryRow label="Total" value="$150.00" strong />);
  const label = screen.getByText("Total", { exact: true }).element() as HTMLElement;
  const value = screen.getByText("$150.00", { exact: true }).element() as HTMLElement;

  expect(getComputedStyle(label).fontSize).toBe("18px");
  expect(getComputedStyle(label).fontWeight).toBe("700");
  expect(getComputedStyle(label).color).toBe(tokenRgb("ink"));

  expect(getComputedStyle(value).fontSize).toBe("18px");
  expect(getComputedStyle(value).fontWeight).toBe("700");
  expect(getComputedStyle(value).color).toBe(tokenRgb("ink"));

  await expectNoAccessibilityViolations(screen.container);
});

test("renders the value in green UI for a saving, in both the regular and the strong form", async () => {
  const regularScreen = await render(<SummaryRow label="Discount" value="-$10.00" saving />);
  const regularValue = regularScreen.getByText("-$10.00", { exact: true }).element() as HTMLElement;
  expect(getComputedStyle(regularValue).color).toBe(tokenRgb("brand-green-ui"));
  expect(getComputedStyle(regularValue).fontSize).toBe("16px");
  expect(getComputedStyle(regularValue).fontWeight).toBe("600");
  await expectNoAccessibilityViolations(regularScreen.container);

  const strongScreen = await render(
    <SummaryRow label="Total savings" value="-$25.00" strong saving />,
  );
  const strongValue = strongScreen.getByText("-$25.00", { exact: true }).element() as HTMLElement;
  expect(getComputedStyle(strongValue).color).toBe(tokenRgb("brand-green-ui"));
  expect(getComputedStyle(strongValue).fontSize).toBe("18px");
  expect(getComputedStyle(strongValue).fontWeight).toBe("700");
  await expectNoAccessibilityViolations(strongScreen.container);
});

test("keeps the label in its own color when only the value is a saving", async () => {
  const regularScreen = await render(<SummaryRow label="Discount" value="-$10.00" saving />);
  const regularLabel = regularScreen
    .getByText("Discount", { exact: true })
    .element() as HTMLElement;
  expect(getComputedStyle(regularLabel).color).toBe(tokenRgb("ink-secondary"));
  await expectNoAccessibilityViolations(regularScreen.container);

  const strongScreen = await render(
    <SummaryRow label="Total savings" value="-$25.00" strong saving />,
  );
  const strongLabel = strongScreen
    .getByText("Total savings", { exact: true })
    .element() as HTMLElement;
  expect(getComputedStyle(strongLabel).color).toBe(tokenRgb("ink"));
  await expectNoAccessibilityViolations(strongScreen.container);
});

test("grows with a long label instead of keeping a fixed height", async () => {
  const longLabel =
    "A very long label that does not fit on a single line inside this narrow row at all";
  const screen = await render(
    <div style={{ width: "200px" }}>
      <SummaryRow label={longLabel} value="$1.00" />
    </div>,
  );
  const label = screen.getByText(longLabel, { exact: true }).element() as HTMLElement;
  const row = label.parentElement as HTMLElement;
  const lineHeight = Number.parseFloat(getComputedStyle(label).lineHeight);
  const labelHeight = label.getBoundingClientRect().height;

  expect(labelHeight).toBeGreaterThan(lineHeight * 1.5);
  expect(row.getBoundingClientRect().height).toBeGreaterThanOrEqual(labelHeight);

  await expectNoAccessibilityViolations(screen.container);
});

test("keeps a long value inside the row, growing it instead of overflowing", async () => {
  const longValue = "A very long value that does not fit on a single line inside this narrow row";
  const screen = await render(
    <div style={{ width: "200px" }}>
      <SummaryRow label="Payment" value={longValue} />
    </div>,
  );
  const value = screen.getByText(longValue, { exact: true }).element() as HTMLElement;
  const row = value.parentElement as HTMLElement;
  const lineHeight = Number.parseFloat(getComputedStyle(value).lineHeight);

  expect(value.getBoundingClientRect().height).toBeGreaterThan(lineHeight * 1.5);
  expect(value.getBoundingClientRect().right).toBeLessThanOrEqual(
    row.getBoundingClientRect().right,
  );

  await expectNoAccessibilityViolations(screen.container);
});

test("keeps the label's word on its own line, clear of the value, under a long value", async () => {
  const longValue = "A very long value that does not fit on a single line inside this narrow row";
  const screen = await render(
    <div style={{ width: "200px" }}>
      <SummaryRow label="Payment" value={longValue} />
    </div>,
  );
  const label = screen.getByText("Payment", { exact: true }).element() as HTMLElement;
  const value = screen.getByText(longValue, { exact: true }).element() as HTMLElement;
  const labelLines = document.createRange();
  labelLines.selectNodeContents(label);
  const labelLineRects = Array.from(labelLines.getClientRects());
  const valueLeft = value.getBoundingClientRect().left;

  expect(labelLineRects).toHaveLength(1);
  for (const lineRect of labelLineRects) {
    expect(lineRect.right).toBeLessThanOrEqual(valueLeft);
  }

  await expectNoAccessibilityViolations(screen.container);
});

test("flushes every line of a wrapped value against the row's right edge", async () => {
  const longValue = "A very long value that does not fit on a single line inside this narrow row";
  const screen = await render(
    <div style={{ width: "200px" }}>
      <SummaryRow label="Payment" value={longValue} />
    </div>,
  );
  const value = screen.getByText(longValue, { exact: true }).element() as HTMLElement;
  const lines = document.createRange();
  lines.selectNodeContents(value);
  const lineRects = Array.from(lines.getClientRects());
  const valueRight = value.getBoundingClientRect().right;

  expect(lineRects.length).toBeGreaterThan(1);
  for (const lineRect of lineRects) {
    expect(lineRect.right).toBeCloseTo(valueRight, 0);
  }

  await expectNoAccessibilityViolations(screen.container);
});

test("keeps an unbreakable value inside the row, narrowing the label past its longest word", async () => {
  const unbreakableValue = "$1.234.567.890,00";
  const screen = await render(
    <div style={{ width: "200px" }}>
      <SummaryRow label="Cash payment received" value={unbreakableValue} />
    </div>,
  );
  const value = screen.getByText(unbreakableValue, { exact: true }).element() as HTMLElement;
  const row = value.parentElement as HTMLElement;

  expect(value.getBoundingClientRect().right).toBeLessThanOrEqual(
    row.getBoundingClientRect().right,
  );

  await expectNoAccessibilityViolations(screen.container);
});

test("keeps the value inside the row when the label is a single unbreakable word", async () => {
  const unbreakableLabel = "Subtotalofeverythingscannedsofarinthissale";
  const screen = await render(
    <div style={{ width: "200px" }}>
      <SummaryRow label={unbreakableLabel} value="$1.00" />
    </div>,
  );
  const value = screen.getByText("$1.00", { exact: true }).element() as HTMLElement;
  const row = value.parentElement as HTMLElement;

  expect(value.getBoundingClientRect().right).toBeLessThanOrEqual(
    row.getBoundingClientRect().right,
  );

  await expectNoAccessibilityViolations(screen.container);
});

test("does not accept a summary row without a label or a value", () => {
  expectTypeOf<{ value: string }>().not.toExtend<SummaryRowProps>();
  expectTypeOf<{ label: string }>().not.toExtend<SummaryRowProps>();
});
