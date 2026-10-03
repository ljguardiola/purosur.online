import { expect, expectTypeOf, test } from "vitest";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { tokenRgb } from "../../test/token-colors";
import { Card, type CardProps } from "./card";

function cardOf(screen: Awaited<ReturnType<typeof render>>): HTMLElement {
  return screen.container.firstElementChild as HTMLElement;
}

test("draws an outlined card with a 1px border, the surface background, 24px padding and 8px radius", async () => {
  const screen = await render(<Card>Contenido</Card>);
  const style = getComputedStyle(cardOf(screen));

  expect(style.borderTopWidth).toBe("1px");
  expect(style.borderTopStyle).toBe("solid");
  expect(style.borderTopColor).toBe(tokenRgb("border"));
  expect(style.backgroundColor).toBe(tokenRgb("surface"));
  expect(style.padding).toBe("24px");
  expect(style.borderRadius).toBe("8px");
});

test("draws a subtle card with no border, the subtle surface background and 16px padding", async () => {
  const screen = await render(<Card variant="subtle">Contenido</Card>);
  const style = getComputedStyle(cardOf(screen));

  expect(style.borderTopWidth).toBe("0px");
  expect(style.backgroundColor).toBe(tokenRgb("surface-subtle"));
  expect(style.padding).toBe("16px");
  expect(style.borderRadius).toBe("8px");
});

test("stacks its children 16px apart", async () => {
  const screen = await render(
    <Card>
      <p>Primero</p>
      <p>Segundo</p>
    </Card>,
  );
  const first = screen.getByText("Primero").element().getBoundingClientRect();
  const second = screen.getByText("Segundo").element().getBoundingClientRect();

  expect(second.top - first.bottom).toBeCloseTo(16, 0);
});

test("adds no landmark or heading of its own", async () => {
  const screen = await render(<Card>Contenido</Card>);

  expect(cardOf(screen).tagName).toBe("DIV");
  expect(cardOf(screen).hasAttribute("role")).toBe(false);
  await expectNoAccessibilityViolations(screen.container);
});

test("does not accept a variant it does not draw", () => {
  expectTypeOf<{ children: string; variant: "filled" }>().not.toExtend<CardProps>();
});
