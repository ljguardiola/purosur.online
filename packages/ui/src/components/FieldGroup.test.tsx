import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../test/axe";
import { tokenRgb } from "../test/token-colors";
import { FieldGroup } from "./FieldGroup";

test("draws its label at the register scale with no FieldSizeProvider above it", async () => {
  const screen = await render(
    <FieldGroup label="Motivo">
      <p>Miel</p>
    </FieldGroup>,
  );
  const label = screen.getByText("Motivo").element() as HTMLElement;
  const style = getComputedStyle(label);

  expect(Math.round(Number.parseFloat(style.fontSize))).toBe(16);
  expect(style.fontWeight).toBe("700");
  expect(style.color).toBe(tokenRgb("ink"));

  await expectNoAccessibilityViolations(screen.container);
});

test("appends the required asterisk to its label only when required", async () => {
  const screen = await render(
    <>
      <FieldGroup label="Categoría" required>
        <p>Miel</p>
      </FieldGroup>
      <FieldGroup label="Unidad de venta">
        <p>Kilogramo</p>
      </FieldGroup>
    </>,
  );

  const required = screen.getByText("Categoría").element() as HTMLElement;
  const optional = screen.getByText("Unidad de venta").element() as HTMLElement;

  expect(getComputedStyle(required, "::after").content).toContain("*");
  expect(getComputedStyle(optional, "::after").content).not.toContain("*");

  await expectNoAccessibilityViolations(screen.container);
});

test("keeps its label 6px above its own children with no FieldSizeProvider above it", async () => {
  const screen = await render(
    <FieldGroup label="Categoría">
      <p>Miel</p>
    </FieldGroup>,
  );
  const label = screen.getByText("Categoría").element() as HTMLElement;
  const wrapper = label.parentElement as HTMLElement;

  expect(Math.round(Number.parseFloat(getComputedStyle(wrapper).rowGap))).toBe(6);

  await expectNoAccessibilityViolations(screen.container);
});

test("renders every child passed to it, in order, below its own label", async () => {
  const screen = await render(
    <FieldGroup label="Códigos de barras">
      <p>First</p>
      <p>Second</p>
    </FieldGroup>,
  );
  const label = screen.getByText("Códigos de barras").element() as HTMLElement;
  const wrapper = label.parentElement as HTMLElement;

  expect(Array.from(wrapper.children).map((child) => child.textContent)).toEqual([
    "Códigos de barras",
    "First",
    "Second",
  ]);

  await expectNoAccessibilityViolations(screen.container);
});
