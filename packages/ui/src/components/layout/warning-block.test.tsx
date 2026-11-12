import { expect, expectTypeOf, test } from "vitest";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { tokenRgb } from "../../test/token-colors";
import { WarningBlock, type WarningBlockProps } from "./warning-block";

function blockOf(screen: Awaited<ReturnType<typeof render>>): HTMLElement {
  return screen.container.firstElementChild as HTMLElement;
}

test("draws a pale orange block with a border, 16px padding and 8px radius", async () => {
  const screen = await render(
    <WarningBlock title="FALTA DE CAMBIO">
      <p>Contenido</p>
    </WarningBlock>,
  );

  const style = getComputedStyle(blockOf(screen));
  expect(style.backgroundColor).toBe(tokenRgb("warning-subtle"));
  expect(style.borderTopWidth).toBe("1px");
  expect(style.borderTopColor).toBe(tokenRgb("warning-soft"));
  expect(style.padding).toBe("16px");
  expect(style.borderRadius).toBe("8px");
  await expect.element(screen.getByText("Contenido")).toBeVisible();
  await expectNoAccessibilityViolations(screen.container);
});

test("names the group it draws with its title", async () => {
  const screen = await render(
    <WarningBlock title="FALTA DE CAMBIO">
      <p>Contenido</p>
    </WarningBlock>,
  );

  await expect.element(screen.getByRole("group", { name: "FALTA DE CAMBIO" })).toBeVisible();
});

test("shows the title at the start and the action at the end of the first row, above the content", async () => {
  const screen = await render(
    <div style={{ width: 340 }}>
      <WarningBlock title="FALTA DE CAMBIO" action={<button type="button">Quitar</button>}>
        <p>Contenido</p>
      </WarningBlock>
    </div>,
  );

  const block = blockOf(screen).getBoundingClientRect();
  const title = screen.getByText("FALTA DE CAMBIO").element().getBoundingClientRect();
  const action = screen.getByRole("button", { name: "Quitar" }).element().getBoundingClientRect();
  const content = screen.getByText("Contenido").element().getBoundingClientRect();
  expect(title.left - block.left).toBeLessThan(24);
  expect(block.right - action.right).toBeLessThan(24);
  expect(Math.abs(title.top - action.top)).toBeLessThan(16);
  expect(content.top).toBeGreaterThan(title.bottom);
});

test("requires a title and content", () => {
  expectTypeOf<Omit<WarningBlockProps, "title">>().not.toExtend<WarningBlockProps>();
  expectTypeOf<Omit<WarningBlockProps, "children">>().not.toExtend<WarningBlockProps>();
});
