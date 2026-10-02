import { expect, expectTypeOf, test } from "vitest";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { tokenRgb } from "../../test/token-colors";
import { FigureStat, type FigureStatProps } from "./figure-stat";

test("shows the label, then the detail, then the value, 4px apart", async () => {
  const screen = await render(
    <FigureStat label="Vuelto a entregar" detail="$ 10.000,00 − $ 8.500,00" value="$ 1.500,00" />,
  );
  const label = screen.getByText("Vuelto a entregar").element().getBoundingClientRect();
  const detail = screen.getByText("$ 10.000,00 − $ 8.500,00").element().getBoundingClientRect();
  const value = screen.getByText("$ 1.500,00").element().getBoundingClientRect();

  expect(detail.top - label.bottom).toBeCloseTo(4, 0);
  expect(value.top - detail.bottom).toBeCloseTo(4, 0);
  await expectNoAccessibilityViolations(screen.container);
});

test("draws the label as the design system's eyebrow", async () => {
  const screen = await render(<FigureStat label="Vuelto" value="$ 1.500,00" />);
  const style = getComputedStyle(screen.getByText("Vuelto").element());

  expect(style.fontSize).toBe("12px");
  expect(style.fontWeight).toBe("700");
  expect(style.textTransform).toBe("uppercase");
  expect(style.color).toBe(tokenRgb("text-eyebrow"));
});

test("draws the value at 32px bold in the accent text color", async () => {
  const screen = await render(<FigureStat label="Vuelto" value="$ 1.500,00" />);
  const style = getComputedStyle(screen.getByText("$ 1.500,00").element());

  expect(style.fontSize).toBe("32px");
  expect(style.fontWeight).toBe("700");
  expect(style.color).toBe(tokenRgb("text-accent"));
});

test("draws the detail in subtle text", async () => {
  const screen = await render(
    <FigureStat label="Vuelto" detail="Cobrado − aplicado" value="$ 1" />,
  );
  const style = getComputedStyle(screen.getByText("Cobrado − aplicado").element());

  expect(style.color).toBe(tokenRgb("text-subtle"));
  expect(style.fontSize).toBe("14px");
  expect(style.fontWeight).toBe("400");
});

test("shows only the label and the value when it is given no detail", async () => {
  const screen = await render(<FigureStat label="Vuelto" value="$ 1.500,00" />);

  expect(screen.container.firstElementChild?.childElementCount).toBe(2);
  expect(screen.container.textContent).toBe("Vuelto$ 1.500,00");
});

test("wraps a long value inside its container instead of overflowing it", async () => {
  const longValue = "Un valor muy largo que no entra en una sola línea de este espacio angosto";
  const screen = await render(
    <div style={{ width: "160px" }}>
      <FigureStat label="Vuelto" value={longValue} />
    </div>,
  );
  const value = screen.getByText(longValue).element();
  const lineHeight = Number.parseFloat(getComputedStyle(value).lineHeight);

  expect(value.getBoundingClientRect().height).toBeGreaterThan(lineHeight * 1.5);
  expect(value.getBoundingClientRect().right).toBeLessThanOrEqual(160);
});

test("does not accept a figure without its value", () => {
  expectTypeOf<{ label: string }>().not.toExtend<FigureStatProps>();
});
