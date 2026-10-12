import { expect, expectTypeOf, test } from "vitest";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { tokenRgb } from "../../test/token-colors";
import { SummaryRow, type SummaryRowProps } from "./summary-row";

test("renders the label on the left and the value on the right, both 16px, label regular and value semibold, in secondary text", async () => {
  const screen = await render(<SummaryRow label="Subtotal" value="$120.00" />);

  const row = screen.container.firstElementChild as HTMLElement;
  const label = screen.getByText("Subtotal", { exact: true }).element() as HTMLElement;
  const value = screen.getByText("$120.00", { exact: true }).element() as HTMLElement;

  expect(row.firstElementChild).toBe(label);
  expect(row.lastElementChild).toBe(value);
  expect(getComputedStyle(row).display).toBe("flex");

  const rowRect = row.getBoundingClientRect();
  const labelRect = label.getBoundingClientRect();
  const valueRect = value.getBoundingClientRect();
  expect(labelRect.right).toBeLessThan(valueRect.left);
  expect(labelRect.left).toBeCloseTo(rowRect.left, 0);
  expect(valueRect.right).toBeCloseTo(rowRect.right, 0);

  expect(getComputedStyle(label).fontSize).toBe("16px");
  expect(getComputedStyle(label).fontWeight).toBe("400");
  expect(getComputedStyle(label).color).toBe(tokenRgb("text-subtle"));

  expect(getComputedStyle(value).fontSize).toBe("16px");
  expect(getComputedStyle(value).fontWeight).toBe("600");
  expect(getComputedStyle(value).color).toBe(tokenRgb("text-subtle"));
});

test("renders no border of its own, leaving the divider to the group that holds it", async () => {
  const screen = await render(<SummaryRow label="Subtotal" value="$120.00" />);
  const row = screen.container.firstElementChild as HTMLElement;
  const style = getComputedStyle(row);

  expect(style.borderTopWidth).toBe("0px");
  expect(style.borderBottomWidth).toBe("0px");
});

test("renders a strong row's label and value at 18px bold, in ink", async () => {
  const screen = await render(<SummaryRow label="Total" value="$150.00" strong />);
  const label = screen.getByText("Total", { exact: true }).element() as HTMLElement;
  const value = screen.getByText("$150.00", { exact: true }).element() as HTMLElement;

  expect(getComputedStyle(label).fontSize).toBe("18px");
  expect(getComputedStyle(label).fontWeight).toBe("700");
  expect(getComputedStyle(label).color).toBe(tokenRgb("text"));

  expect(getComputedStyle(value).fontSize).toBe("18px");
  expect(getComputedStyle(value).fontWeight).toBe("700");
  expect(getComputedStyle(value).color).toBe(tokenRgb("text"));
});

test("renders the value in green UI for a saving, in both the regular and the strong form", async () => {
  const regularScreen = await render(<SummaryRow label="Discount" value="-$10.00" saving />);
  const regularValue = regularScreen.getByText("-$10.00", { exact: true }).element() as HTMLElement;
  expect(getComputedStyle(regularValue).color).toBe(tokenRgb("success"));
  expect(getComputedStyle(regularValue).fontSize).toBe("16px");
  expect(getComputedStyle(regularValue).fontWeight).toBe("600");

  const strongScreen = await render(
    <SummaryRow label="Total savings" value="-$25.00" strong saving />,
  );
  const strongValue = strongScreen.getByText("-$25.00", { exact: true }).element() as HTMLElement;
  expect(getComputedStyle(strongValue).color).toBe(tokenRgb("success"));
  expect(getComputedStyle(strongValue).fontSize).toBe("18px");
  expect(getComputedStyle(strongValue).fontWeight).toBe("700");
});

test("keeps the label in its own color when only the value is a saving", async () => {
  const regularScreen = await render(<SummaryRow label="Discount" value="-$10.00" saving />);
  const regularLabel = regularScreen
    .getByText("Discount", { exact: true })
    .element() as HTMLElement;
  expect(getComputedStyle(regularLabel).color).toBe(tokenRgb("text-subtle"));

  const strongScreen = await render(
    <SummaryRow label="Total savings" value="-$25.00" strong saving />,
  );
  const strongLabel = strongScreen
    .getByText("Total savings", { exact: true })
    .element() as HTMLElement;
  expect(getComputedStyle(strongLabel).color).toBe(tokenRgb("text"));
});

test("renders the value bold in strong red for an error tone, at its form's size", async () => {
  const regularScreen = await render(<SummaryRow label="Discount" value="− $10.00" tone="error" />);
  const regularValue = regularScreen
    .getByText("− $10.00", { exact: true })
    .element() as HTMLElement;
  expect(getComputedStyle(regularValue).color).toBe(tokenRgb("error-strong"));
  expect(getComputedStyle(regularValue).fontSize).toBe("16px");
  expect(getComputedStyle(regularValue).fontWeight).toBe("700");

  const strongScreen = await render(
    <SummaryRow label="Total discount" value="− $25.00" strong tone="error" />,
  );
  const strongValue = strongScreen.getByText("− $25.00", { exact: true }).element() as HTMLElement;
  expect(getComputedStyle(strongValue).color).toBe(tokenRgb("error-strong"));
  expect(getComputedStyle(strongValue).fontSize).toBe("18px");
  expect(getComputedStyle(strongValue).fontWeight).toBe("700");
});

test("renders the value at 20px bold in strong blue for an info tone, in both the regular and the strong form", async () => {
  const regularScreen = await render(<SummaryRow label="Line total" value="$90.00" tone="info" />);
  const regularValue = regularScreen.getByText("$90.00", { exact: true }).element() as HTMLElement;
  expect(getComputedStyle(regularValue).color).toBe(tokenRgb("info-strong"));
  expect(getComputedStyle(regularValue).fontSize).toBe("20px");
  expect(getComputedStyle(regularValue).fontWeight).toBe("700");

  const strongScreen = await render(
    <SummaryRow label="Line total" value="$95.00" strong tone="info" />,
  );
  const strongValue = strongScreen.getByText("$95.00", { exact: true }).element() as HTMLElement;
  expect(getComputedStyle(strongValue).color).toBe(tokenRgb("info-strong"));
  expect(getComputedStyle(strongValue).fontSize).toBe("20px");
  expect(getComputedStyle(strongValue).fontWeight).toBe("700");
});

test("keeps the label in its own form and color when only the value carries a tone", async () => {
  const errorScreen = await render(<SummaryRow label="Discount" value="− $10.00" tone="error" />);
  const errorLabel = errorScreen.getByText("Discount", { exact: true }).element() as HTMLElement;
  expect(getComputedStyle(errorLabel).color).toBe(tokenRgb("text-subtle"));
  expect(getComputedStyle(errorLabel).fontSize).toBe("16px");
  expect(getComputedStyle(errorLabel).fontWeight).toBe("400");

  const infoScreen = await render(
    <SummaryRow label="Line total" value="$90.00" strong tone="info" />,
  );
  const infoLabel = infoScreen.getByText("Line total", { exact: true }).element() as HTMLElement;
  expect(getComputedStyle(infoLabel).color).toBe(tokenRgb("text"));
  expect(getComputedStyle(infoLabel).fontSize).toBe("18px");
  expect(getComputedStyle(infoLabel).fontWeight).toBe("700");

  await expectNoAccessibilityViolations(infoScreen.container);
});

test("renders a detail row's label at 14px and its value at 16px, both regular, in secondary text", async () => {
  const screen = await render(<SummaryRow label="List price" value="$84.00" detail />);
  const label = screen.getByText("List price", { exact: true }).element() as HTMLElement;
  const value = screen.getByText("$84.00", { exact: true }).element() as HTMLElement;

  expect(getComputedStyle(label).fontSize).toBe("14px");
  expect(getComputedStyle(label).fontWeight).toBe("400");
  expect(getComputedStyle(label).color).toBe(tokenRgb("text-subtle"));

  expect(getComputedStyle(value).fontSize).toBe("16px");
  expect(getComputedStyle(value).fontWeight).toBe("400");
  expect(getComputedStyle(value).color).toBe(tokenRgb("text-subtle"));

  await expectNoAccessibilityViolations(screen.container);
});

test("renders a detail row's toned value as the tone draws it, keeping the label at 14px regular", async () => {
  const errorScreen = await render(
    <SummaryRow label="Discount" value="− $8.40" detail tone="error" />,
  );
  const errorLabel = errorScreen.getByText("Discount", { exact: true }).element() as HTMLElement;
  const errorValue = errorScreen.getByText("− $8.40", { exact: true }).element() as HTMLElement;
  expect(getComputedStyle(errorValue).color).toBe(tokenRgb("error-strong"));
  expect(getComputedStyle(errorValue).fontSize).toBe("16px");
  expect(getComputedStyle(errorValue).fontWeight).toBe("700");
  expect(getComputedStyle(errorLabel).fontSize).toBe("14px");
  expect(getComputedStyle(errorLabel).fontWeight).toBe("400");
  expect(getComputedStyle(errorLabel).color).toBe(tokenRgb("text-subtle"));

  const infoScreen = await render(
    <SummaryRow label="Line total" value="$75.60" detail tone="info" />,
  );
  const infoLabel = infoScreen.getByText("Line total", { exact: true }).element() as HTMLElement;
  const infoValue = infoScreen.getByText("$75.60", { exact: true }).element() as HTMLElement;
  expect(getComputedStyle(infoValue).color).toBe(tokenRgb("info-strong"));
  expect(getComputedStyle(infoValue).fontSize).toBe("20px");
  expect(getComputedStyle(infoValue).fontWeight).toBe("700");
  expect(getComputedStyle(infoLabel).fontSize).toBe("14px");
  expect(getComputedStyle(infoLabel).fontWeight).toBe("400");
  expect(getComputedStyle(infoLabel).color).toBe(tokenRgb("text-subtle"));
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
});

test("keeps an unbreakable value inside the row, narrowing the label past its longest word", async () => {
  const unbreakableValue = "$1.234.567.890,00";
  const label = "Cash payment received";
  const screen = await render(
    <div style={{ width: "200px" }}>
      <SummaryRow label={label} value={unbreakableValue} />
    </div>,
  );
  const valueElement = screen.getByText(unbreakableValue, { exact: true }).element() as HTMLElement;
  const labelElement = screen.getByText(label, { exact: true }).element() as HTMLElement;
  const row = valueElement.parentElement as HTMLElement;
  const labelLines = document.createRange();
  labelLines.selectNodeContents(labelElement);
  const labelLineRects = Array.from(labelLines.getClientRects());
  const valueRect = valueElement.getBoundingClientRect();

  expect(valueRect.right).toBeLessThanOrEqual(row.getBoundingClientRect().right);
  expect(valueRect.width).toBeCloseTo(valueElement.scrollWidth, 0);

  expect(labelLineRects.length).toBeGreaterThan(label.split(" ").length);
  for (const lineRect of labelLineRects) {
    expect(lineRect.right).toBeLessThanOrEqual(valueRect.left);
  }

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

test("does not accept a row that is both a saving and carries a tone", () => {
  expectTypeOf<{
    label: string;
    value: string;
    saving: true;
    tone: "error";
  }>().not.toExtend<SummaryRowProps>();
  expectTypeOf<{
    label: string;
    value: string;
    saving: true;
    tone: "info";
  }>().not.toExtend<SummaryRowProps>();
});

test("accepts only the error and info tones", () => {
  expectTypeOf<{ label: string; value: string; tone: "error" }>().toExtend<SummaryRowProps>();
  expectTypeOf<{ label: string; value: string; tone: "info" }>().toExtend<SummaryRowProps>();
  expectTypeOf<{ label: string; value: string; tone: "success" }>().not.toExtend<SummaryRowProps>();
});

test("does not accept a row that is both strong and a detail", () => {
  expectTypeOf<{
    label: string;
    value: string;
    strong: true;
    detail: true;
  }>().not.toExtend<SummaryRowProps>();
  expectTypeOf<{ label: string; value: string; detail: true }>().toExtend<SummaryRowProps>();
});

test("does not accept a detail row that is a saving", () => {
  expectTypeOf<{
    label: string;
    value: string;
    detail: true;
    saving: true;
  }>().not.toExtend<SummaryRowProps>();
  expectTypeOf<{
    label: string;
    value: string;
    detail: true;
    tone: "error";
  }>().toExtend<SummaryRowProps>();
  expectTypeOf<{ label: string; value: string; saving: true }>().toExtend<SummaryRowProps>();
  expectTypeOf<{
    label: string;
    value: string;
    strong: true;
    saving: true;
  }>().toExtend<SummaryRowProps>();
});
