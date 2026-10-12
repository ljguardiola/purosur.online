import { expect, expectTypeOf, test } from "vitest";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../../test/axe";
import { tokenRgb } from "../../../test/token-colors";
import { TableCellText, type TableCellTextProps } from "./table-cell-text";

test("renders a falsy-but-present description, like 0, as a real description line rather than a stray value", async () => {
  const screen = await render(<TableCellText description={0}>Coffee</TableCellText>);
  const description = screen.getByText("0", { exact: true }).element() as HTMLElement;

  expect(description.tagName).toBe("SPAN");
  expect(getComputedStyle(description).fontSize).toBe("14px");
  expect(getComputedStyle(description).color).toBe(tokenRgb("text-subtle"));

  await expectNoAccessibilityViolations(screen.container);
});

test("stacks its own text and description line with a 4px gap and their own 24px/20px line heights", async () => {
  const screen = await render(<TableCellText description="SKU-001">Coffee</TableCellText>);
  const container = screen.getByText("Coffee").element().parentElement as HTMLElement;
  const text = screen.getByText("Coffee", { exact: true }).element() as HTMLElement;
  const description = screen.getByText("SKU-001", { exact: true }).element() as HTMLElement;

  expect(getComputedStyle(container).display).toBe("flex");
  expect(getComputedStyle(container).flexDirection).toBe("column");
  expect(getComputedStyle(container).rowGap).toBe("4px");
  expect(getComputedStyle(text).lineHeight).toBe("24px");
  expect(getComputedStyle(description).lineHeight).toBe("20px");
});

test("renders no description line when no description is given", async () => {
  const screen = await render(<TableCellText>Coffee</TableCellText>);

  expect(screen.container.querySelectorAll("span")).toHaveLength(1);
});

test("renders no description line for a boolean description, like the common item.sku !== undefined && item.sku pattern", async () => {
  const falseScreen = await render(<TableCellText description={false}>Coffee</TableCellText>);
  expect(falseScreen.container.querySelectorAll("span")).toHaveLength(1);
  await expectNoAccessibilityViolations(falseScreen.container);

  const trueScreen = await render(<TableCellText description={true}>Coffee</TableCellText>);
  expect(trueScreen.container.querySelectorAll("span")).toHaveLength(1);
  await expectNoAccessibilityViolations(trueScreen.container);
});

test("does not name its secondary text detail", () => {
  expectTypeOf<TableCellTextProps>().not.toHaveProperty("detail");
});

test("leaves its text color and weight to the row unless it is asked for a tone or to be strong", async () => {
  const screen = await render(<TableCellText>Coffee</TableCellText>);
  const text = screen.getByText("Coffee", { exact: true }).element() as HTMLElement;

  expect(text.className).not.toMatch(/text-text|text-error|font-bold/);
});

test.each([
  ["subtle", "text-subtle"],
  ["error", "error-strong"],
  ["success", "success-strong"],
] as const)("writes its text in the %s tone", async (tone, token) => {
  const screen = await render(<TableCellText tone={tone}>Coffee</TableCellText>);
  const text = screen.getByText("Coffee", { exact: true }).element() as HTMLElement;

  expect(getComputedStyle(text).color).toBe(tokenRgb(token));
  await expectNoAccessibilityViolations(screen.container);
});

test("writes its text in bold when it is strong", async () => {
  const screen = await render(<TableCellText strong>Coffee</TableCellText>);
  const text = screen.getByText("Coffee", { exact: true }).element() as HTMLElement;

  expect(getComputedStyle(text).fontWeight).toBe("700");
});

test("writes its text in a monospace font when it is monospace", async () => {
  const screen = await render(<TableCellText monospace>L-2409</TableCellText>);
  const text = screen.getByText("L-2409", { exact: true }).element() as HTMLElement;

  expect(getComputedStyle(text).fontFamily).toMatch(/monospace$/);
});

test("writes its text at the detail size when it is asked for it", async () => {
  const screen = await render(<TableCellText size="detail">Compra del 01/10/2026</TableCellText>);
  const text = screen.getByText("Compra del 01/10/2026", { exact: true }).element() as HTMLElement;

  expect(getComputedStyle(text).fontSize).toBe("14px");
  expect(getComputedStyle(text).lineHeight).toBe("20px");
});

test("writes its text in the body font at the body size unless it is asked otherwise", async () => {
  const screen = await render(<TableCellText>Coffee</TableCellText>);
  const text = screen.getByText("Coffee", { exact: true }).element() as HTMLElement;

  expect(getComputedStyle(text).fontFamily).not.toMatch(/monospace/);
  expect(getComputedStyle(text).fontSize).toBe("16px");
});

test("writes an error description in bold, in the error tone", async () => {
  const screen = await render(
    <TableCellText description="Saldo negativo" descriptionTone="error">
      Coffee
    </TableCellText>,
  );
  const description = screen.getByText("Saldo negativo", { exact: true }).element() as HTMLElement;

  expect(getComputedStyle(description).color).toBe(tokenRgb("error-strong"));
  expect(getComputedStyle(description).fontWeight).toBe("700");
  await expectNoAccessibilityViolations(screen.container);
});

test("accepts an undefined tone and description tone, for a caller that picks them from a condition", () => {
  expectTypeOf<{
    tone: undefined;
    descriptionTone: undefined;
    children: string;
  }>().toExtend<TableCellTextProps>();
});
