import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../test/axe";
import { FieldGroup } from "./FieldGroup";
import { FieldSizeProvider } from "./FieldSize";

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

test("keeps its label 4px above its own children inside a backoffice FieldSizeProvider", async () => {
  const screen = await render(
    <FieldSizeProvider size="backoffice">
      <FieldGroup label="Categoría">
        <p>Miel</p>
      </FieldGroup>
    </FieldSizeProvider>,
  );
  const label = screen.getByText("Categoría").element() as HTMLElement;
  const wrapper = label.parentElement as HTMLElement;

  expect(Math.round(Number.parseFloat(getComputedStyle(wrapper).rowGap))).toBe(4);

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
