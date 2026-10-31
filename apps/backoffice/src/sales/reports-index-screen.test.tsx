import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { expect, test } from "vitest";
import { render } from "../shell/test-support/render-with-router";
import { ReportsIndexScreen } from "./reports-index-screen";

async function renderScreen({
  returnsShown = false,
  aiCostShown = false,
}: {
  returnsShown?: boolean;
  aiCostShown?: boolean;
} = {}) {
  return render(
    <FieldSizeProvider size="backoffice">
      <main>
        <ReportsIndexScreen returnsShown={returnsShown} aiCostShown={aiCostShown} />
      </main>
    </FieldSizeProvider>,
  );
}

test("groups the sales reports in a card titled Ventas", async () => {
  const screen = await renderScreen();

  await expect.element(screen.getByRole("heading", { name: "Reportes", level: 1 })).toBeVisible();
  const sales = screen.getByRole("region", { name: "Ventas" });
  await expect.element(sales).toBeVisible();
  expect(sales.getByRole("link").elements()).toHaveLength(9);
  await expectNoAccessibilityViolations(screen.container);
});

test("lists the sales by day report as a link to it", async () => {
  const screen = await renderScreen();

  await expect
    .element(screen.getByRole("link", { name: "Ventas por día o por rango" }))
    .toHaveAttribute("href", "/reports/sales-by-day");
});

test("lists the sales by payment method report as a link to it", async () => {
  const screen = await renderScreen();

  await expect
    .element(screen.getByRole("link", { name: "Ventas por medio de pago" }))
    .toHaveAttribute("href", "/reports/sales-by-payment-method");
});

test("lists the sales by product and category report as a link to it", async () => {
  const screen = await renderScreen();

  await expect
    .element(screen.getByRole("link", { name: "Ventas por producto y por categoría" }))
    .toHaveAttribute("href", "/reports/sales-by-product-and-category");
});

test("lists the sales by cashier report as a link to it", async () => {
  const screen = await renderScreen();

  await expect
    .element(screen.getByRole("link", { name: "Ventas por cajero" }))
    .toHaveAttribute("href", "/reports/sales-by-cashier");
});

test("lists the weights typed by hand report as a link to it", async () => {
  const screen = await renderScreen();

  await expect
    .element(screen.getByRole("link", { name: "Pesos tipeados a mano" }))
    .toHaveAttribute("href", "/reports/hand-typed-weights");
});

test("lists the removed lines and cancelled sales report as a link to it", async () => {
  const screen = await renderScreen();

  await expect
    .element(screen.getByRole("link", { name: "Líneas quitadas y ventas canceladas" }))
    .toHaveAttribute("href", "/reports/removed-lines-and-cancelled-sales");
});

test("lists the discounts by promotion report as a link to it", async () => {
  const screen = await renderScreen();

  await expect
    .element(screen.getByRole("link", { name: "Descuentos por promoción" }))
    .toHaveAttribute("href", "/reports/sales-by-promotion");
});

test("lists the manual discounts report as a link to it", async () => {
  const screen = await renderScreen();

  await expect
    .element(screen.getByRole("link", { name: "Descuentos manuales y sobre el total" }))
    .toHaveAttribute("href", "/reports/manual-discounts");
});

test("lists the average ticket report as a link to it", async () => {
  const screen = await renderScreen();

  await expect
    .element(screen.getByRole("link", { name: "Ticket promedio" }))
    .toHaveAttribute("href", "/reports/average-ticket");
});

test("groups the cash reports in a card titled Caja", async () => {
  const screen = await renderScreen();

  const cash = screen.getByRole("region", { name: "Caja" });
  await expect.element(cash).toBeVisible();
  expect(cash.getByRole("link").elements()).toHaveLength(3);
});

test("lists the returns report as a link to it in the Caja card when it is shown", async () => {
  const screen = await renderScreen({ returnsShown: true });

  const cash = screen.getByRole("region", { name: "Caja" });
  expect(cash.getByRole("link").elements()).toHaveLength(4);
  await expect
    .element(cash.getByRole("link", { name: "Devoluciones" }))
    .toHaveAttribute("href", "/reports/returns");
});

test("leaves the returns report out when it is not shown", async () => {
  const screen = await renderScreen();

  expect(screen.getByRole("link", { name: "Devoluciones" }).query()).toBeNull();
});

test("groups the fiscal reports in a card titled Fiscal", async () => {
  const screen = await renderScreen();

  const fiscal = screen.getByRole("region", { name: "Fiscal" });
  await expect.element(fiscal).toBeVisible();
  expect(fiscal.getByRole("link").elements()).toHaveLength(1);
  await expect
    .element(fiscal.getByRole("link", { name: "Comprobantes emitidos" }))
    .toHaveAttribute("href", "/reports/fiscal-documents");
});

test("lists the payments confirmed by hand report as a link to it", async () => {
  const screen = await renderScreen();

  await expect
    .element(screen.getByRole("link", { name: "Pagos confirmados a mano" }))
    .toHaveAttribute("href", "/reports/hand-confirmed-payments");
});

test("lists the cash session closes report as a link to it", async () => {
  const screen = await renderScreen();

  await expect
    .element(screen.getByRole("link", { name: "Cierres de sesión" }))
    .toHaveAttribute("href", "/reports/cash-session-closes");
});

test("lists the cash movements report as a link to it", async () => {
  const screen = await renderScreen();

  await expect
    .element(screen.getByRole("link", { name: "Movimientos de caja" }))
    .toHaveAttribute("href", "/reports/cash-movements");
});

test("groups the stock reports in a card titled Stock", async () => {
  const screen = await renderScreen();

  const stock = screen.getByRole("region", { name: "Stock" });
  await expect.element(stock).toBeVisible();
  expect(stock.getByRole("link").elements()).toHaveLength(3);
});

test("lists the valued current stock report as a link to it", async () => {
  const screen = await renderScreen();

  await expect
    .element(screen.getByRole("link", { name: "Stock actual valorizado" }))
    .toHaveAttribute("href", "/reports/current-stock");
});

test("lists the lots approaching their expiry report as a link to it", async () => {
  const screen = await renderScreen();

  await expect
    .element(screen.getByRole("link", { name: "Lotes por vencer" }))
    .toHaveAttribute("href", "/reports/expiring-lots");
});

test("lists the losses by reason report as a link to it", async () => {
  const screen = await renderScreen();

  await expect
    .element(screen.getByRole("link", { name: "Mermas por motivo" }))
    .toHaveAttribute("href", "/reports/losses-by-reason");
});

test("groups the purchases reports in a card titled Compras", async () => {
  const screen = await renderScreen();

  const purchases = screen.getByRole("region", { name: "Compras" });
  await expect.element(purchases).toBeVisible();
  expect(purchases.getByRole("link").elements()).toHaveLength(2);
});

test("lists the purchases by supplier report as a link to it", async () => {
  const screen = await renderScreen();

  await expect
    .element(screen.getByRole("link", { name: "Compras por proveedor" }))
    .toHaveAttribute("href", "/reports/purchases-by-supplier");
});

test("groups the price reports in a card titled Precios", async () => {
  const screen = await renderScreen();

  const prices = screen.getByRole("region", { name: "Precios" });
  await expect.element(prices).toBeVisible();
  expect(prices.getByRole("link").elements()).toHaveLength(1);
  await expect
    .element(prices.getByRole("link", { name: "Precios sin revisar" }))
    .toHaveAttribute("href", "/reports/prices-past-review-deadline");
});

test("lists the freight by period report as a link to it", async () => {
  const screen = await renderScreen();

  await expect
    .element(screen.getByRole("link", { name: "Flete por período" }))
    .toHaveAttribute("href", "/reports/freight-by-period");
});

test("lists the AI cost by period report under Compras when it is shown", async () => {
  const screen = await renderScreen({ aiCostShown: true });

  await expect
    .element(
      screen
        .getByRole("region", { name: "Compras" })
        .getByRole("link", { name: "Costo de IA por período" }),
    )
    .toHaveAttribute("href", "/reports/ai-cost-by-period");
});

test("leaves the AI cost by period report out when it is not shown", async () => {
  const screen = await renderScreen();

  expect(screen.getByRole("link", { name: "Costo de IA por período" }).query()).toBeNull();
});

test("groups the profitability reports in a card titled Rentabilidad", async () => {
  const screen = await renderScreen();

  const profitability = screen.getByRole("region", { name: "Rentabilidad" });
  await expect.element(profitability).toBeVisible();
  expect(profitability.getByRole("link").elements()).toHaveLength(1);
  await expect
    .element(profitability.getByRole("link", { name: "Margen por producto y por categoría" }))
    .toHaveAttribute("href", "/reports/margin");
});
