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

test("draws a heading-size value at 20px bold in the accent text color", async () => {
  const screen = await render(<FigureStat size="heading" label="Contado" value="$ 1.500,00" />);
  const style = getComputedStyle(screen.getByText("$ 1.500,00").element());

  expect(style.fontSize).toBe("20px");
  expect(style.fontWeight).toBe("700");
  expect(style.color).toBe(tokenRgb("text-accent"));
  await expectNoAccessibilityViolations(screen.container);
});

test("keeps the eyebrow label at every size", async () => {
  const screen = await render(<FigureStat size="heading" label="Contado" value="$ 1" />);
  const style = getComputedStyle(screen.getByText("Contado").element());

  expect(style.fontSize).toBe("12px");
  expect(style.textTransform).toBe("uppercase");
});

test("shows its label and no value while the value loads, marked busy", async () => {
  const screen = await render(<FigureStat label="Efectivo esperado" loading />);
  const figure = screen.container.firstElementChild as HTMLElement;

  await expect.element(screen.getByText("Efectivo esperado")).toBeVisible();
  expect(figure.textContent).toBe("Efectivo esperado");
  expect(figure.getAttribute("aria-busy")).toBe("true");
  await expectNoAccessibilityViolations(screen.container);
});

test("reveals its value's placeholder exactly at 300ms, so a fast load never flashes it", async () => {
  const screen = await render(<FigureStat label="Efectivo esperado" loading />);
  const placeholder = screen.container.querySelector('[aria-hidden="true"]') as HTMLElement;

  const [animation] = placeholder.getAnimations();
  if (!animation) {
    throw new Error("Expected the placeholder to have a running CSS animation.");
  }
  animation.pause();

  animation.currentTime = 299;
  expect(getComputedStyle(placeholder).opacity).toBe("0");

  animation.currentTime = 300;
  expect(getComputedStyle(placeholder).opacity).toBe("1");
});

test.each(["display", "heading"] as const)(
  "takes the same height while its %s-size value loads as once it is shown",
  async (size) => {
    const screen = await render(
      <div>
        <FigureStat size={size} label="Cargando" loading />
        <FigureStat size={size} label="Cargado" value="$ 1.500,00" />
      </div>,
    );
    const [loading, loaded] = Array.from(
      screen.container.firstElementChild?.children ?? [],
    ) as HTMLElement[];

    expect(loading?.getBoundingClientRect().height).toBeCloseTo(
      loaded?.getBoundingClientRect().height ?? 0,
      0,
    );
  },
);

test("does not accept a figure without its value", () => {
  expectTypeOf<{ label: string }>().not.toExtend<FigureStatProps>();
});

test("does not accept a value while it loads", () => {
  expectTypeOf<{ label: string; loading: true; value: string }>().not.toExtend<FigureStatProps>();
});
