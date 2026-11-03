import { type ReactNode, useState } from "react";
import { expect, expectTypeOf, test } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { tokenRgb } from "../../test/token-colors";
import { SidePanel, type SidePanelProps } from "./side-panel";

test("is a complementary landmark named by its label", async () => {
  const screen = await render(<SidePanel label="Panel de cobro">Contenido</SidePanel>);

  await expect.element(screen.getByRole("complementary", { name: "Panel de cobro" })).toBeVisible();
  await expectNoAccessibilityViolations(screen.container);
});

test("is 392px wide with a left border and the surface background", async () => {
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
});

test("keeps its content 32px inside its edges", async () => {
  const screen = await render(
    <div style={{ display: "flex", height: "600px" }}>
      <SidePanel label="Panel">
        <p style={{ width: "100%" }}>Contenido</p>
      </SidePanel>
    </div>,
  );
  const panel = screen.getByRole("complementary").element().getBoundingClientRect();
  const content = screen.getByText("Contenido").element().getBoundingClientRect();

  expect(content.top - panel.top).toBeCloseTo(32, 0);
  expect(content.left - panel.left).toBeCloseTo(1 + 32, 0);
  expect(panel.right - content.right).toBeCloseTo(32, 0);
});

test("stacks its children 16px apart", async () => {
  const screen = await render(
    <SidePanel label="Panel">
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

function scrollToTheEndAround(element: Element) {
  let area = element.parentElement;
  while (area !== null && area.scrollHeight <= area.clientHeight) {
    area = area.parentElement;
  }
  if (area === null) {
    throw new Error("No area around the element scrolls");
  }
  area.scrollTop = area.scrollHeight;
}

const FORTY_LINES = Array.from({ length: 40 }, (_, index) => `Línea ${index + 1}`).map((line) => (
  <p key={line}>{line}</p>
));

test("scrolls a body taller than the panel inside itself, ending 16px above the footer, which stays at the bottom edge", async () => {
  const screen = await render(
    <div style={{ display: "flex", height: "600px" }}>
      <SidePanel label="Panel" footer={<button type="button">Cancelar</button>}>
        {FORTY_LINES}
      </SidePanel>
    </div>,
  );
  const panel = screen.getByRole("complementary").element().getBoundingClientRect();
  const footer = screen.getByRole("button", { name: "Cancelar" }).element().getBoundingClientRect();
  const lastLine = screen.getByText("Línea 40", { exact: true }).element();

  expect(panel.height).toBe(600);
  expect(footer.bottom).toBeCloseTo(panel.bottom - 32, 0);
  scrollToTheEndAround(lastLine);
  expect(footer.top - lastLine.getBoundingClientRect().bottom).toBeCloseTo(16, 0);
  expect(
    screen.getByRole("button", { name: "Cancelar" }).element().getBoundingClientRect(),
  ).toEqual(footer);
});

test("scrolls a body taller than the panel and without a footer inside itself, ending 32px above the bottom edge", async () => {
  const screen = await render(
    <div style={{ display: "flex", height: "600px" }}>
      <SidePanel label="Panel">{FORTY_LINES}</SidePanel>
    </div>,
  );
  const panel = screen.getByRole("complementary").element().getBoundingClientRect();
  const lastLine = screen.getByText("Línea 40", { exact: true }).element();

  expect(panel.height).toBe(600);
  scrollToTheEndAround(lastLine);
  expect(panel.bottom - lastLine.getBoundingClientRect().bottom).toBeCloseTo(32, 0);
});

test("lets the keyboard reach a body taller than the panel to scroll it", async () => {
  const screen = await render(
    <div style={{ display: "flex", height: "600px" }}>
      <SidePanel label="Panel" footer={<button type="button">Cancelar</button>}>
        {FORTY_LINES}
      </SidePanel>
    </div>,
  );
  const body = screen.getByRole("region", { name: "Panel" });

  await expect.element(body).toHaveAttribute("tabindex", "0");
  await userEvent.tab();

  await expect.element(body).toHaveFocus();
  await expectNoAccessibilityViolations(screen.container);
});

function GrowingPanel() {
  const [lines, setLines] = useState(1);
  return (
    <div style={{ display: "flex", height: "600px" }}>
      <SidePanel label="Panel" footer={<button type="button">Cancelar</button>}>
        <button type="button" onClick={() => setLines(40)}>
          Agregar líneas
        </button>
        {FORTY_LINES.slice(0, lines)}
      </SidePanel>
    </div>
  );
}

test("makes a body a keyboard stop once its content outgrows it", async () => {
  const screen = await render(<GrowingPanel />);

  expect(screen.getByRole("region").elements()).toHaveLength(0);
  await screen.getByRole("button", { name: "Agregar líneas" }).click();

  await expect
    .element(screen.getByRole("region", { name: "Panel" }))
    .toHaveAttribute("tabindex", "0");
});

test("adds no keyboard stop to a body that fits the panel", async () => {
  const screen = await render(
    <div style={{ display: "flex", height: "600px" }}>
      <SidePanel label="Panel" footer={<button type="button">Cancelar</button>}>
        <p>Contenido</p>
      </SidePanel>
    </div>,
  );

  await expect.element(screen.getByText("Contenido")).toBeVisible();
  expect(screen.getByRole("region").elements()).toHaveLength(0);
  expect(screen.getByText("Contenido").element().parentElement?.hasAttribute("tabindex")).toBe(
    false,
  );
  await userEvent.tab();

  await expect.element(screen.getByRole("button", { name: "Cancelar" })).toHaveFocus();
});

test("stacks the footer's own children 16px apart", async () => {
  const screen = await render(
    <SidePanel
      label="Panel"
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

test("does not accept a panel without its label", () => {
  expectTypeOf<{ children: ReactNode }>().not.toExtend<SidePanelProps>();
});
