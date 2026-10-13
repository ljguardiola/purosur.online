import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { expect, test } from "vitest";
import { ReportsIndexScreen } from "./reports-index-screen";
import { render } from "./test-support/render-with-router";

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
  expect(sales.getByRole("link").elements()).toHaveLength(2);
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
