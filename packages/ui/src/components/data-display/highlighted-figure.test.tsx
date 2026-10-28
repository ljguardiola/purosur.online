import { expect, expectTypeOf, test } from "vitest";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { tokenRgb } from "../../test/token-colors";
import { HighlightedFigure, type HighlightedFigureProps } from "./highlighted-figure";

function figureOf(screen: Awaited<ReturnType<typeof render>>): HTMLElement {
  return screen.container.firstElementChild as HTMLElement;
}

test("draws a pale green card with no border, 16px padding and 8px radius", async () => {
  const screen = await render(<HighlightedFigure label="Margen" value="45,6 %" />);
  const style = getComputedStyle(figureOf(screen));

  expect(style.backgroundColor).toBe(tokenRgb("success-subtle"));
  expect(style.borderTopWidth).toBe("0px");
  expect(style.padding).toBe("16px");
  expect(style.borderRadius).toBe("8px");
  await expectNoAccessibilityViolations(screen.container);
});

test("shows the label at the start and the value at the end of one row", async () => {
  const screen = await render(
    <div style={{ width: "480px" }}>
      <HighlightedFigure label="Margen" value="45,6 %" />
    </div>,
  );
  const cardBox = (figureOf(screen).firstElementChild as HTMLElement).getBoundingClientRect();
  const label = screen.getByText("Margen").element().getBoundingClientRect();
  const value = screen.getByText("45,6 %").element().getBoundingClientRect();

  expect(label.left - cardBox.left).toBeCloseTo(16, 0);
  expect(cardBox.right - value.right).toBeCloseTo(16, 0);
  expect(value.top).toBeLessThan(label.bottom);
});

test("draws the value at 32px bold in the strong success color, aligned to the end", async () => {
  const screen = await render(<HighlightedFigure label="Margen" value="45,6 %" />);
  const style = getComputedStyle(screen.getByText("45,6 %").element());

  expect(style.fontSize).toBe("32px");
  expect(style.fontWeight).toBe("700");
  expect(style.color).toBe(tokenRgb("success-strong"));
  expect(style.textAlign).toBe("end");
});

test("draws the label as the design system's eyebrow", async () => {
  const screen = await render(<HighlightedFigure label="Margen" value="45,6 %" />);
  const style = getComputedStyle(screen.getByText("Margen").element());

  expect(style.fontSize).toBe("12px");
  expect(style.fontWeight).toBe("700");
  expect(style.textTransform).toBe("uppercase");
  expect(style.color).toBe(tokenRgb("text-eyebrow"));
});

test("shows the detail 4px under the label, in subtle text", async () => {
  const screen = await render(
    <HighlightedFigure label="Margen" detail="$ 8.200,00 − $ 4.460,00" value="45,6 %" />,
  );
  const label = screen.getByText("Margen").element().getBoundingClientRect();
  const detailElement = screen.getByText("$ 8.200,00 − $ 4.460,00").element();
  const style = getComputedStyle(detailElement);

  expect(detailElement.getBoundingClientRect().top - label.bottom).toBeCloseTo(4, 0);
  expect(style.color).toBe(tokenRgb("text-subtle"));
  expect(style.fontSize).toBe("14px");
  expect(style.fontWeight).toBe("400");
  await expectNoAccessibilityViolations(screen.container);
});

test("shows only the label and the value when it is given no detail", async () => {
  const screen = await render(<HighlightedFigure label="Margen" value="45,6 %" />);

  expect(screen.container.textContent).toBe("Margen45,6 %");
});

test("moves the value under the label, still at the end, when the row is too narrow", async () => {
  const screen = await render(
    <div style={{ width: "200px" }}>
      <HighlightedFigure label="Margen" detail="$ 8.200,00 − $ 4.460,00" value="$ 1.234.567,00" />
    </div>,
  );
  const container = (figureOf(screen).firstElementChild as HTMLElement).getBoundingClientRect();
  const detail = screen.getByText("$ 8.200,00 − $ 4.460,00").element().getBoundingClientRect();
  const value = screen.getByText("$ 1.234.567,00").element().getBoundingClientRect();

  expect(value.top).toBeGreaterThanOrEqual(detail.bottom);
  expect(container.right - value.right).toBeCloseTo(16, 0);
  expect(value.left).toBeGreaterThanOrEqual(container.left);
});

test("shows its label and no value while the value loads, marked busy", async () => {
  const screen = await render(<HighlightedFigure label="Margen" loading />);

  await expect.element(screen.getByText("Margen")).toBeVisible();
  expect(figureOf(screen).textContent).toBe("Margen");
  expect(figureOf(screen).getAttribute("aria-busy")).toBe("true");
  await expectNoAccessibilityViolations(screen.container);
});

test("takes the same height while its value loads as once it is shown", async () => {
  const screen = await render(
    <div style={{ width: "480px" }}>
      <HighlightedFigure label="Cargando" loading />
      <HighlightedFigure label="Cargado" value="45,6 %" />
    </div>,
  );
  const [loading, loaded] = Array.from(
    screen.container.firstElementChild?.children ?? [],
  ) as HTMLElement[];

  expect(loading?.getBoundingClientRect().height).toBeCloseTo(
    loaded?.getBoundingClientRect().height ?? 0,
    0,
  );
});

test("does not accept a figure without its value", () => {
  expectTypeOf<{ label: string }>().not.toExtend<HighlightedFigureProps>();
});

test("does not accept a value while it loads", () => {
  expectTypeOf<{
    label: string;
    loading: true;
    value: string;
  }>().not.toExtend<HighlightedFigureProps>();
});
