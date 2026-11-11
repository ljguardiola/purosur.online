import { Wallet } from "lucide-react";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
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

function closablePanel(close: { onPress: () => void; label?: string }) {
  return (
    <div style={{ display: "flex", height: "480px", justifyContent: "flex-end" }}>
      <SidePanel
        label="Abrir caja"
        header={<SidePanelTitle icon={<Wallet />} title="Abrir caja" close={close} />}
      >
        <p>Contenido</p>
      </SidePanel>
    </div>
  );
}

test("shows an Esc keycap button at the right of the title that closes the panel", async () => {
  const onPress = vi.fn();
  const screen = await render(closablePanel({ onPress }));
  const panelBox = screen.getByRole("complementary").element().getBoundingClientRect();
  const close = screen.getByRole("button", { name: "Cerrar con Esc" });

  expect(close.element().querySelector("kbd")?.textContent).toBe("Esc");
  expect(panelBox.right - close.element().getBoundingClientRect().right).toBeLessThan(40);
  await userEvent.click(close);

  expect(onPress).toHaveBeenCalledOnce();
  await expectNoAccessibilityViolations(screen.container);
});

test("follows the Esc keycap with the given label, which names the button", async () => {
  const onPress = vi.fn();
  const screen = await render(closablePanel({ onPress, label: "Cancelar" }));
  const close = screen.getByRole("button", { name: "Cancelar" });

  await expect.element(close).toBeVisible();
  expect(close.element().textContent).toBe("EscCancelar");
  await userEvent.click(close);

  expect(onPress).toHaveBeenCalledOnce();
  await expect
    .element(screen.getByRole("button", { name: "Cerrar con Esc" }))
    .not.toBeInTheDocument();
  await expectNoAccessibilityViolations(screen.container);
});

test("draws no close button when none is given", async () => {
  const screen = await render(
    <SidePanel label="Abrir caja" header={<SidePanelTitle icon={<Wallet />} title="Abrir caja" />}>
      <p>Contenido</p>
    </SidePanel>,
  );

  await expect.element(screen.getByRole("button")).not.toBeInTheDocument();
});
