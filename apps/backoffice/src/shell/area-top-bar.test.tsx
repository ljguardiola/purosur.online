import { Button } from "@purosur/ui";
import { expect, test } from "vitest";
import { AreaTopBar } from "./area-top-bar";
import { AreaTopBarAlertsCount } from "./area-top-bar-alerts-count";
import { render } from "./test-support/render-with-router";

test("shows the eyebrow, the title as the page heading and the action", async () => {
  const screen = await render(
    <AreaTopBar
      eyebrow="Pedidos"
      title="Listas de proveedores"
      action={<Button>Cargar una lista</Button>}
    />,
  );

  await expect.element(screen.getByText("Pedidos")).toBeVisible();
  await expect
    .element(screen.getByRole("heading", { name: "Listas de proveedores", level: 1 }))
    .toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Cargar una lista" })).toBeVisible();
});

test("shows the open alerts count the area provides", async () => {
  const screen = await render(
    <AreaTopBarAlertsCount value={<p>8 alertas abiertas</p>}>
      <AreaTopBar eyebrow="Pedidos" title="Listas de proveedores" />
    </AreaTopBarAlertsCount>,
  );

  await expect.element(screen.getByText("8 alertas abiertas")).toBeVisible();
});
