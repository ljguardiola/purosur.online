import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { expect, test } from "vitest";
import { render } from "../shell/test-support/render-with-router";
import { ReportsIndexScreen } from "./reports-index-screen";

async function renderScreen() {
  return render(
    <FieldSizeProvider size="backoffice">
      <main>
        <ReportsIndexScreen />
      </main>
    </FieldSizeProvider>,
  );
}

test("groups the sales reports in a card titled Ventas", async () => {
  const screen = await renderScreen();

  await expect.element(screen.getByRole("heading", { name: "Reportes", level: 1 })).toBeVisible();
  const sales = screen.getByRole("region", { name: "Ventas" });
  await expect.element(sales).toBeVisible();
  expect(sales.getByRole("link").elements()).toHaveLength(6);
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

test("lists the discounts by promotion report as a link to it", async () => {
  const screen = await renderScreen();

  await expect
    .element(screen.getByRole("link", { name: "Descuentos por promoción" }))
    .toHaveAttribute("href", "/reports/sales-by-promotion");
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
  expect(cash.getByRole("link").elements()).toHaveLength(1);
});

test("lists the payments confirmed by hand report as a link to it", async () => {
  const screen = await renderScreen();

  await expect
    .element(screen.getByRole("link", { name: "Pagos confirmados a mano" }))
    .toHaveAttribute("href", "/reports/hand-confirmed-payments");
});
