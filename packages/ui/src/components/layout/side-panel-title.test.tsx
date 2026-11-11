import { Undo2, Wallet } from "lucide-react";
import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { SidePanel } from "./side-panel";
import { SidePanelTitle } from "./side-panel-title";

test("names the panel with a level-two heading beside its icon", async () => {
  const screen = await render(
    <div style={{ display: "flex", height: "480px", justifyContent: "flex-end" }}>
      <SidePanel
        label="Abrir caja"
        header={<SidePanelTitle icon={<Wallet />} title="Abrir caja" />}
      >
        <p>Contenido</p>
      </SidePanel>
    </div>,
  );

  await expect.element(screen.getByRole("heading", { level: 2, name: "Abrir caja" })).toBeVisible();
  expect(screen.container.querySelector("svg")?.closest("[aria-hidden='true']")).not.toBeNull();
  await expectNoAccessibilityViolations(screen.container);
});

test("shows its icon before the title", async () => {
  const screen = await render(
    <div style={{ display: "flex", height: "480px", justifyContent: "flex-end" }}>
      <SidePanel label="Panel" header={<SidePanelTitle icon={<Wallet />} title="Sesión abierta" />}>
        <p>Contenido</p>
      </SidePanel>
    </div>,
  );
  const icon = screen.container.querySelector("svg")?.getBoundingClientRect();
  const title = screen.getByRole("heading").element().getBoundingClientRect();

  expect(icon?.right).toBeLessThanOrEqual(title.left);
});

test("shows what it is given after the title, at the far end", async () => {
  const screen = await render(
    <div style={{ display: "flex", height: "480px", justifyContent: "flex-end" }}>
      <SidePanel
        label="Panel"
        header={
          <SidePanelTitle icon={<Undo2 />} title="¿Pasar el cobro a reembolso?" tone="warning">
            <button type="button">Cerrar</button>
          </SidePanelTitle>
        }
      >
        <p>Contenido</p>
      </SidePanel>
    </div>,
  );
  const title = screen.getByRole("heading").element().getBoundingClientRect();
  const close = screen.getByRole("button", { name: "Cerrar" }).element().getBoundingClientRect();

  expect(close.left).toBeGreaterThanOrEqual(title.right);
  await expectNoAccessibilityViolations(screen.container);
});

test("colors the icon badge by its tone", async () => {
  const screen = await render(
    <div style={{ display: "flex", height: "480px", justifyContent: "flex-end" }}>
      <SidePanel
        label="Panel"
        header={
          <>
            <SidePanelTitle icon={<Wallet />} title="Neutro" />
            <SidePanelTitle icon={<Undo2 />} title="Aviso" tone="warning" />
          </>
        }
      >
        <p>Contenido</p>
      </SidePanel>
    </div>,
  );
  const [neutral, warning] = Array.from(screen.container.querySelectorAll("svg")).map(
    (icon) => getComputedStyle(icon.closest("span[aria-hidden='true']") as Element).backgroundColor,
  );

  expect(neutral).not.toBe(warning);
});

test.each([
  ["panel", 32],
  ["wide", 24],
  ["fill", 32],
] as const)("sits at the inset of a %s panel", async (width, inset) => {
  const screen = await render(
    <div style={{ display: "flex", height: "480px", justifyContent: "flex-end" }}>
      <SidePanel
        label="Panel"
        width={width}
        header={<SidePanelTitle icon={<Wallet />} title="Sesión abierta" />}
      >
        <p>Contenido</p>
      </SidePanel>
    </div>,
  );
  const panel = screen.getByRole("complementary").element().getBoundingClientRect();
  const badge = screen.container
    .querySelector("svg")
    ?.closest("span[aria-hidden='true']")
    ?.getBoundingClientRect();
  const borderWidth = width === "fill" ? 0 : 1;

  expect((badge?.left ?? 0) - panel.left - borderWidth).toBe(inset);
});
