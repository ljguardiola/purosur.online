import { expect, expectTypeOf, test } from "vitest";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { tokenRgb } from "../../test/token-colors";
import { SidePanel, type SidePanelProps } from "./side-panel";

test("is a complementary landmark named by its label", async () => {
  const screen = await render(<SidePanel label="Panel de cobro">Contenido</SidePanel>);

  await expect.element(screen.getByRole("complementary", { name: "Panel de cobro" })).toBeVisible();
  await expectNoAccessibilityViolations(screen.container);
});

test("is a complementary landmark with no name when it is given no label", async () => {
  const screen = await render(<SidePanel>Contenido</SidePanel>);
  const panel = screen.getByRole("complementary").element();

  expect(panel.hasAttribute("aria-label")).toBe(false);
  await expectNoAccessibilityViolations(screen.container);
});

test("is 392px wide with a left border, the surface background and 32px padding", async () => {
  const screen = await render(
    <div style={{ display: "flex", height: "600px" }}>
      <SidePanel label="Panel">Contenido</SidePanel>
    </div>,
  );
  const panel = screen.getByRole("complementary").element();
  const style = getComputedStyle(panel);

  expect(panel.getBoundingClientRect().width).toBe(392);
  expect(style.borderLeftWidth).toBe("1px");
  expect(style.borderLeftColor).toBe(tokenRgb("border"));
  expect(style.borderRightWidth).toBe("0px");
  expect(style.backgroundColor).toBe(tokenRgb("surface"));
  expect(style.paddingTop).toBe("32px");
  expect(style.paddingRight).toBe("32px");
  expect(style.paddingBottom).toBe("32px");
  expect(style.paddingLeft).toBe("32px");
});

test("stacks its children 16px apart", async () => {
  const screen = await render(
    <SidePanel>
      <p>Primero</p>
      <p>Segundo</p>
    </SidePanel>,
  );
  const first = screen.getByText("Primero").element().getBoundingClientRect();
  const second = screen.getByText("Segundo").element().getBoundingClientRect();

  expect(second.top - first.bottom).toBeCloseTo(16, 0);
});

test("sits its footer at the bottom edge, 32px above it, in a tall container", async () => {
  const screen = await render(
    <div style={{ display: "flex", height: "600px" }}>
      <SidePanel label="Panel" footer={<button type="button">Cancelar</button>}>
        <p>Contenido</p>
      </SidePanel>
    </div>,
  );
  const panel = screen.getByRole("complementary").element().getBoundingClientRect();
  const footer = screen.getByRole("button", { name: "Cancelar" }).element().getBoundingClientRect();

  expect(panel.height).toBe(600);
  expect(footer.bottom).toBeCloseTo(panel.bottom - 32, 0);
});

test("stacks the footer's own children 16px apart", async () => {
  const screen = await render(
    <SidePanel
      footer={
        <>
          <p>Aviso</p>
          <button type="button">Cancelar</button>
        </>
      }
    >
      <p>Contenido</p>
    </SidePanel>,
  );
  const notice = screen.getByText("Aviso").element().getBoundingClientRect();
  const button = screen.getByRole("button", { name: "Cancelar" }).element().getBoundingClientRect();

  expect(button.top - notice.bottom).toBeCloseTo(16, 0);
});

test("does not accept a panel without its content", () => {
  expectTypeOf<{ label: string }>().not.toExtend<SidePanelProps>();
});
