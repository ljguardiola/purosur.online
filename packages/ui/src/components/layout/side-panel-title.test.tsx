import { Ban, Undo2, Wallet } from "lucide-react";
import { expect, expectTypeOf, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { tokenRgb } from "../../test/token-colors";
import { SidePanel } from "./side-panel";
import { SidePanelTitle, type SidePanelTitleProps } from "./side-panel-title";

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

test("draws its Esc button after the title, at the far end", async () => {
  const screen = await render(
    <div style={{ display: "flex", height: "480px", justifyContent: "flex-end" }}>
      <SidePanel
        label="Panel"
        header={
          <SidePanelTitle
            icon={<Undo2 />}
            title="¿Pasar el cobro a reembolso?"
            tone="warning"
            onClose={() => undefined}
          />
        }
      >
        <p>Contenido</p>
      </SidePanel>
    </div>,
  );
  const title = screen.getByRole("heading").element().getBoundingClientRect();
  const close = screen
    .getByRole("button", { name: "Cerrar con Esc" })
    .element()
    .getBoundingClientRect();

  expect(close.left).toBeGreaterThanOrEqual(title.right);
  await expectNoAccessibilityViolations(screen.container);
});

test("keeps its Esc button disabled while closing is not allowed", async () => {
  const onClose = vi.fn();
  const screen = await render(
    <SidePanelTitle icon={<Undo2 />} title="Reembolso" onClose={onClose} closeDisabled />,
  );

  await expect.element(screen.getByRole("button", { name: "Cerrar con Esc" })).toBeDisabled();
  expect(onClose).not.toHaveBeenCalled();
});

test("takes nothing else to draw beside its title", () => {
  expectTypeOf<SidePanelTitleProps>().not.toHaveProperty("children");
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

test("offers no close button when the panel takes no closing", async () => {
  const screen = await render(<SidePanelTitle icon={<Wallet />} title="Abrir caja" />);

  await expect.element(screen.getByRole("heading", { name: "Abrir caja" })).toBeVisible();
  await expect.element(screen.getByRole("button")).not.toBeInTheDocument();
});

test("closes the panel from its Esc button beside the title", async () => {
  const onClose = vi.fn();
  const screen = await render(
    <SidePanelTitle icon={<Wallet />} title="Efectivo" onClose={onClose} />,
  );

  await userEvent.click(screen.getByRole("button", { name: "Cerrar con Esc" }));

  expect(onClose).toHaveBeenCalledOnce();
  await expectNoAccessibilityViolations(screen.container);
});

test("paints the icon badge red on light red in the error tone", async () => {
  const screen = await render(
    <SidePanelTitle icon={<Ban />} title="Cancelar venta" tone="error" />,
  );
  const badge = screen.container.querySelector("svg")?.closest("span[aria-hidden='true']");

  const style = getComputedStyle(badge as Element);
  expect(style.backgroundColor).toBe(tokenRgb("error-subtle"));
  expect(style.color).toBe(tokenRgb("error-strong"));
});

test("shows a named lock right after the title when given a lock label", async () => {
  const screen = await render(
    <SidePanelTitle icon={<Wallet />} title="Precio de la línea" lockLabel="Precio bloqueado" />,
  );
  const lock = screen.getByRole("img", { name: "Precio bloqueado" });
  const title = screen.getByRole("heading", { name: "Precio de la línea" }).element();

  await expect.element(lock).toBeVisible();
  const text = document.createRange();
  text.selectNodeContents(title);
  const lockBox = lock.element().getBoundingClientRect();
  expect(lockBox.left).toBeGreaterThanOrEqual(text.getBoundingClientRect().right);
  expect(lockBox.left - text.getBoundingClientRect().right).toBeLessThan(16);
  await expectNoAccessibilityViolations(screen.container);
});

test("shows no lock when it has no lock label", async () => {
  const screen = await render(<SidePanelTitle icon={<Wallet />} title="Precio de la línea" />);

  await expect.element(screen.getByRole("img")).not.toBeInTheDocument();
});
