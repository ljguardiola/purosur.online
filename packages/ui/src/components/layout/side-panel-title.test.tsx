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
