import { Undo2, Wallet } from "lucide-react";
import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { PanelHeading } from "./panel-heading";

test("heads its panel with its title, its icon hidden from assistive technology", async () => {
  const screen = await render(<PanelHeading title="Sesión abierta" icon={<Wallet />} />);

  await expect.element(screen.getByRole("heading", { name: "Sesión abierta" })).toBeVisible();
  expect(screen.container.querySelector("svg")?.closest('[aria-hidden="true"]')).not.toBeNull();
  await expectNoAccessibilityViolations(screen.container);
});

test("shows its icon before the title", async () => {
  const screen = await render(<PanelHeading title="Sesión abierta" icon={<Wallet />} />);
  const icon = screen.container.querySelector("svg")?.getBoundingClientRect();
  const title = screen.getByRole("heading").element().getBoundingClientRect();

  expect(icon?.right).toBeLessThanOrEqual(title.left);
});

test("shows what it is given after the title, at the far end", async () => {
  const screen = await render(
    <div style={{ width: "392px" }}>
      <PanelHeading title="¿Pasar el cobro a reembolso?" icon={<Undo2 />} tone="warning">
        <button type="button">Cerrar</button>
      </PanelHeading>
    </div>,
  );
  const title = screen.getByRole("heading").element().getBoundingClientRect();
  const close = screen.getByRole("button", { name: "Cerrar" }).element().getBoundingClientRect();

  expect(close.left).toBeGreaterThanOrEqual(title.right);
  await expectNoAccessibilityViolations(screen.container);
});
