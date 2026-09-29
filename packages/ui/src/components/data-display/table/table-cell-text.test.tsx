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
