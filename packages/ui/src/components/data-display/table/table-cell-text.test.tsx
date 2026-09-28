import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../../test/axe";
import { tokenRgb } from "../../../test/token-colors";
import { TableCellText } from "./table-cell-text";

test("renders a falsy-but-present detail, like 0, as a real detail line rather than a stray value", async () => {
  const screen = await render(<TableCellText detail={0}>Coffee</TableCellText>);
  const detail = screen.getByText("0", { exact: true }).element() as HTMLElement;

  expect(detail.tagName).toBe("SPAN");
  expect(getComputedStyle(detail).fontSize).toBe("14px");
  expect(getComputedStyle(detail).color).toBe(tokenRgb("text-subtle"));

  await expectNoAccessibilityViolations(screen.container);
});

test("stacks its own text and detail line with a 4px gap and their own 24px/20px line heights", async () => {
  const screen = await render(<TableCellText detail="SKU-001">Coffee</TableCellText>);
  const container = screen.getByText("Coffee").element().parentElement as HTMLElement;
  const text = screen.getByText("Coffee", { exact: true }).element() as HTMLElement;
  const detail = screen.getByText("SKU-001", { exact: true }).element() as HTMLElement;

  expect(getComputedStyle(container).display).toBe("flex");
  expect(getComputedStyle(container).flexDirection).toBe("column");
  expect(getComputedStyle(container).rowGap).toBe("4px");
  expect(getComputedStyle(text).lineHeight).toBe("24px");
  expect(getComputedStyle(detail).lineHeight).toBe("20px");
});

test("renders no detail line when no detail is given", async () => {
  const screen = await render(<TableCellText>Coffee</TableCellText>);

  expect(screen.container.querySelectorAll("span")).toHaveLength(1);
});

test("renders no detail line for a boolean detail, like the common item.sku !== undefined && item.sku pattern", async () => {
  const falseScreen = await render(<TableCellText detail={false}>Coffee</TableCellText>);
  expect(falseScreen.container.querySelectorAll("span")).toHaveLength(1);
  await expectNoAccessibilityViolations(falseScreen.container);

  const trueScreen = await render(<TableCellText detail={true}>Coffee</TableCellText>);
  expect(trueScreen.container.querySelectorAll("span")).toHaveLength(1);
  await expectNoAccessibilityViolations(trueScreen.container);
});
