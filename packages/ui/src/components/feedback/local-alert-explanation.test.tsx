import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { LocalAlertExplanation } from "./local-alert-explanation";

test("explains what a register that can't sell means and what to do", async () => {
  const screen = await render(
    <LocalAlertExplanation kind="sales_denied" reason="event_history_broken" />,
  );

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

test("explains a register that can't sell because its database is damaged", async () => {
  const screen = await render(
    <LocalAlertExplanation kind="sales_denied" reason="local_database_damaged" />,
  );

  await expect
    .element(
      screen.getByText(
        "Esta caja dejó de abrir ventas nuevas porque su base de datos está dañada.",
      ),
    )
    .toBeVisible();
  await expect
    .element(screen.getByText(/Restaurar la base de datos de la caja desde su copia de respaldo/))
    .toBeVisible();
  expect(screen.container.textContent).not.toContain("registro de operaciones");
});

test("explains a register short of disk space at startup, naming the space it needs", async () => {
  const screen = await render(
    <LocalAlertExplanation
      kind="sales_denied"
      reason="disk_space_short_at_startup"
      required_free_bytes={13_421_772_800}
    />,
  );

  await expect.element(screen.getByText(/necesita 12,5 GB libres/)).toBeVisible();
  await expect.element(screen.getByText(/Liberar espacio en la notebook/)).toBeVisible();
});

test("explains a register whose disk is full", async () => {
  const screen = await render(
    <LocalAlertExplanation kind="sales_denied" reason="disk_full" disk_free_ratio={0.034} />,
  );

  await expect
    .element(screen.getByText(/La venta en curso se puede completar y cobrar/))
    .toBeVisible();
});

test("explains a register on a critically low battery", async () => {
  const screen = await render(
    <LocalAlertExplanation kind="sales_denied" reason="battery_critical" />,
  );

  await expect
    .element(screen.getByText(/Después la caja envía lo pendiente y se cierra sola/))
    .toBeVisible();
  await expect
    .element(screen.getByText("Conectar la notebook a la corriente para seguir vendiendo."))
    .toBeVisible();
});

test("explains a notebook running low on battery, naming the charge left and the one that stops new sales", async () => {
  const screen = await render(
    <LocalAlertExplanation kind="battery_low" charge_percent={15} critical_percent={10} />,
  );

  await expect
    .element(
      screen.getByText("Queda 15 % de batería. Por debajo del 10 % no se abren ventas nuevas."),
    )
    .toBeVisible();
  await expect
    .element(screen.getByText("Conectar la notebook a la corriente.", { exact: true }))
    .toBeVisible();
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

test("has no accessibility violations", async () => {
  const screen = await render(
    <LocalAlertExplanation kind="sales_denied" reason="event_history_broken" />,
  );

  await expectNoAccessibilityViolations(screen.container);
});
