import { Button } from "@purosur/ui";
import { expect, test } from "vitest";
import { StockTopBarAlertsCount } from "../shell/stock-top-bar-alerts-count";
import { render } from "../shell/test-support/render-with-router";
import { PurchasingTopBar } from "./purchasing-screen-parts";

test("shows the eyebrow, the title as the page heading and the actions", async () => {
  const screen = await render(
    <PurchasingTopBar
      eyebrow="Pedidos"
      title="Listas de proveedores"
      actions={<Button>Cargar una lista</Button>}
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
    <StockTopBarAlertsCount value={<p>8 alertas abiertas</p>}>
      <PurchasingTopBar eyebrow="Pedidos" title="Listas de proveedores" />
    </StockTopBarAlertsCount>,
  );

  await expect.element(screen.getByText("8 alertas abiertas")).toBeVisible();
});
