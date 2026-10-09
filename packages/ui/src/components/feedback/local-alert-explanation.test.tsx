import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { LocalAlertExplanation } from "./local-alert-explanation";

test("explains what a register that can't sell means and what to do, with no title by default", async () => {
  const screen = await render(<LocalAlertExplanation kind="sales_denied" />);

  await expect
    .element(
      screen.getByText(
        "Esta caja dejó de abrir ventas nuevas porque encontró un problema en su registro de operaciones.",
      ),
    )
    .toBeVisible();
  await expect.element(screen.getByText("Qué hacer", { exact: true })).toBeVisible();
  await expect
    .element(
      screen.getByText(
        "Avisar al Administrador de inmediato; ya fue notificado, pero conviene confirmarle la situación.",
      ),
    )
    .toBeVisible();
  expect(screen.container.textContent).not.toContain("La caja no puede vender");
});

test("explains a register that isn't syncing", async () => {
  const screen = await render(<LocalAlertExplanation kind="register_silent" />);

  await expect
    .element(
      screen.getByText(
        "Hace rato que esta caja no logra mandar nada a la nube durante el horario de atención.",
      ),
    )
    .toBeVisible();
  await expect.element(screen.getByText(/Revisar la conexión a internet del local/)).toBeVisible();
});

test("shows the kind's title above its explanation when asked to", async () => {
  const screen = await render(<LocalAlertExplanation kind="register_silent" title />);

  await expect.element(screen.getByText("La caja no está sincronizando")).toBeVisible();
});

test("has no accessibility violations, with or without its title", async () => {
  const withoutTitle = await render(<LocalAlertExplanation kind="sales_denied" />);
  await expectNoAccessibilityViolations(withoutTitle.container);
  await withoutTitle.unmount();

  const withTitle = await render(<LocalAlertExplanation kind="register_silent" title />);
  await expectNoAccessibilityViolations(withTitle.container);
});
