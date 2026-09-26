import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../test/axe";
import { tokenRgb } from "../test/token-colors";
import { FieldLabel } from "./FieldLabel";
import { FieldSizeProvider } from "./fieldSize";

test("draws at the register scale with no FieldSizeProvider above it", async () => {
  const screen = await render(<FieldLabel>Motivo</FieldLabel>);
  const label = screen.getByText("Motivo").element() as HTMLElement;
  const style = getComputedStyle(label);

  expect(Math.round(Number.parseFloat(style.fontSize))).toBe(16);
  expect(style.fontWeight).toBe("700");
  expect(style.color).toBe(tokenRgb("ink"));

  await expectNoAccessibilityViolations(screen.container);
});

test("draws at the backoffice scale inside a FieldSizeProvider", async () => {
  const screen = await render(
    <FieldSizeProvider size="backoffice">
      <FieldLabel>Categoría</FieldLabel>
    </FieldSizeProvider>,
  );
  const label = screen.getByText("Categoría").element() as HTMLElement;
  const style = getComputedStyle(label);

  expect(Math.round(Number.parseFloat(style.fontSize))).toBe(14);
  expect(style.fontWeight).toBe("700");
  expect(style.color).toBe(tokenRgb("ink"));

  await expectNoAccessibilityViolations(screen.container);
});

test("appends the required asterisk only when required", async () => {
  const screen = await render(
    <>
      <FieldLabel required>Categoría</FieldLabel>
      <FieldLabel>Unidad de venta</FieldLabel>
    </>,
  );

  const required = screen.getByText("Categoría").element() as HTMLElement;
  const optional = screen.getByText("Unidad de venta").element() as HTMLElement;

  expect(getComputedStyle(required, "::after").content).toContain("*");
  expect(getComputedStyle(optional, "::after").content).not.toContain("*");

  await expectNoAccessibilityViolations(screen.container);
});
