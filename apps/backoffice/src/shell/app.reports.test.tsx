import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { weekHandConfirmedReport } from "../payments/test-support/payments-report-fixtures";
import { ANA_USER_ID } from "../sales/test-support/sales-fixtures";
import { openSession } from "../sessions/test-support/open-session";
import { App } from "./app";
import { emptyHelp, resetPageState } from "./test-support/app";
import { reportsServices } from "./test-support/reports-services";
import { opensOnlyScreens } from "./test-support/screen-routes";

opensOnlyScreens([
  "/",
  "/help",
  "/reports/sales-by-day",
  "/reports/sales-by-payment-method",
  "/reports/sales-by-product-and-category",
  "/reports/sales-by-cashier",
  "/reports/hand-typed-weights",
  "/reports/sales-by-promotion",
  "/reports/manual-discounts",
  "/reports/cash-rounding",
  "/reports/average-ticket",
]);

beforeEach(resetPageState);

test("hides the Reportes item from someone who can only see the returns report", async () => {
  const services = reportsServices(["returns_report"]);
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("navigation", { name: "Áreas" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Reportes", exact: true }).query()).toBeNull();
});

test("sends someone who can only see the returns report away from the list of reports", async () => {
  const services = reportsServices(["returns_report"]);
  window.history.pushState(null, "", "/reports");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("tab", { name: "Passkeys y PIN" })).toBeVisible();
});

test("sends someone with the reports permission but not the returns one away from the returns report", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(null, "", "/reports/returns");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("tab", { name: "Passkeys y PIN" })).toBeVisible();
  expect(services.returnsHistoryScreen.fetchReturnsReport).not.toHaveBeenCalled();
});

test("opens the sales by day report at its address and reads it from the cloud", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(null, "", "/reports/sales-by-day");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect
    .element(screen.getByRole("heading", { name: "Ventas por día o por rango", level: 1 }))
    .toBeVisible();
  await expect.element(screen.getByText("02/10/2026")).toBeVisible();
  expect(services.salesByDayScreen.fetchSalesReport).toHaveBeenCalledWith({});
  expect(document.title).toBe("Ventas por día o por rango · Puro Sur");
});

test("opens the sales by payment method report at its address and reads it from the cloud", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(null, "", "/reports/sales-by-payment-method");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect
    .element(screen.getByRole("heading", { name: "Ventas por medio de pago", level: 1 }))
    .toBeVisible();
  await expect.element(screen.getByText("Efectivo")).toBeVisible();
  expect(services.salesByPaymentMethodScreen.fetchSalesByPaymentMethod).toHaveBeenCalledWith({});
  expect(document.title).toBe("Ventas por medio de pago · Puro Sur");
});

test("opens the sales by product and category report at its address and reads it from the cloud", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(null, "", "/reports/sales-by-product-and-category");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect
    .element(screen.getByRole("heading", { name: "Ventas por producto y por categoría", level: 1 }))
    .toBeVisible();
  await expect.element(screen.getByText("Fiambres")).toBeVisible();
  expect(
    services.salesByProductAndCategoryScreen.fetchSalesByProductAndCategory,
  ).toHaveBeenCalledWith({ group: "category" });
  expect(document.title).toBe("Ventas por producto y por categoría · Puro Sur");
});

test("keeps the grouping of the sales by product and category report in the address", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(null, "", "/reports/sales-by-product-and-category");
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByText("Fiambres")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: /Agrupar:/ }));
  await userEvent.click(screen.getByRole("option", { name: "Por producto" }));

  await expect.poll(() => window.location.search).toBe("?group=product");
});

test("rewrites a refused range of the sales by product and category report out of the address", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(
    null,
    "",
    "/reports/sales-by-product-and-category?from=2026-10-08&to=2026-10-07&group=product",
  );

  await render(<App help={emptyHelp} services={services} />);

  await expect.poll(() => window.location.search).toBe("?group=product");
  expect(
    services.salesByProductAndCategoryScreen.fetchSalesByProductAndCategory,
  ).toHaveBeenCalledWith({ group: "product" });
});

test("opens the sales by cashier report at its address and reads it from the cloud", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(null, "", "/reports/sales-by-cashier");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect
    .element(screen.getByRole("heading", { name: "Ventas por cajero", level: 1 }))
    .toBeVisible();
  await expect.element(screen.getByRole("table").getByText("Beto")).toBeVisible();
  expect(services.salesByCashierScreen.fetchSalesByCashier).toHaveBeenCalledWith({});
  expect(document.title).toBe("Ventas por cajero · Puro Sur");
});

test("keeps the order of the sales by cashier report in the address", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(null, "", "/reports/sales-by-cashier");
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByRole("table").getByText("Beto")).toBeVisible();

  await userEvent.click(
    screen.getByRole("table").getByRole("button", { name: "Importe", exact: true }),
  );

  await expect.poll(() => window.location.search).toBe("?sortBy=amount");
});

test("rewrites a refused range of the sales by cashier report out of the address", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(
    null,
    "",
    "/reports/sales-by-cashier?from=2026-10-08&to=2026-10-07&sortBy=name",
  );

  await render(<App help={emptyHelp} services={services} />);

  await expect.poll(() => window.location.search).toBe("?sortBy=name");
  expect(services.salesByCashierScreen.fetchSalesByCashier).toHaveBeenCalledWith({});
});

test("opens the weights typed by hand report at its address and reads it from the cloud", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(null, "", "/reports/hand-typed-weights");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect
    .element(screen.getByRole("heading", { name: "Pesos tipeados a mano", level: 1 }))
    .toBeVisible();
  await expect.element(screen.getByRole("table").first().getByText("Beto")).toBeVisible();
  expect(services.handTypedWeightsScreen.fetchHandTypedWeights).toHaveBeenCalledWith({});
  expect(document.title).toBe("Pesos tipeados a mano · Puro Sur");
});

test("opens the discounts by promotion report at its address and reads it from the cloud", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(null, "", "/reports/sales-by-promotion");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect
    .element(screen.getByRole("heading", { name: "Descuentos por promoción", level: 1 }))
    .toBeVisible();
  await expect.element(screen.getByRole("table").getByText("Tres por dos")).toBeVisible();
  expect(services.salesByPromotionScreen.fetchSalesByPromotion).toHaveBeenCalledWith({});
  expect(document.title).toBe("Descuentos por promoción · Puro Sur");
});

test("keeps the order of the discounts by promotion report in the address", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(null, "", "/reports/sales-by-promotion");
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByRole("table").getByText("Tres por dos")).toBeVisible();

  await userEvent.click(
    screen.getByRole("table").getByRole("button", { name: "Líneas", exact: true }),
  );

  await expect.poll(() => window.location.search).toBe("?sortBy=lines");
});

test("rewrites a refused range of the discounts by promotion report out of the address", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(
    null,
    "",
    "/reports/sales-by-promotion?from=2026-10-08&to=2026-10-07&sortBy=name",
  );

  await render(<App help={emptyHelp} services={services} />);

  await expect.poll(() => window.location.search).toBe("?sortBy=name");
  expect(services.salesByPromotionScreen.fetchSalesByPromotion).toHaveBeenCalledWith({});
});

test("opens the manual discounts report at its address and reads it from the cloud", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(null, "", "/reports/manual-discounts");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect
    .element(
      screen.getByRole("heading", { name: "Descuentos manuales y sobre el total", level: 1 }),
    )
    .toBeVisible();
  await expect.element(screen.getByRole("table").getByText("Cliente frecuente")).toBeVisible();
  expect(services.manualDiscountsScreen.fetchManualDiscounts).toHaveBeenCalledWith({});
  expect(document.title).toBe("Descuentos manuales y sobre el total · Puro Sur");
});

test("opens the cash rounding report at its address and reads it from the cloud", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(null, "", "/reports/cash-rounding");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect
    .element(screen.getByRole("heading", { name: "Redondeo en efectivo", level: 1 }))
    .toBeVisible();
  await expect.element(screen.getByRole("table").getByText("Caja principal")).toBeVisible();
  expect(services.cashRoundingScreen.fetchCashRounding).toHaveBeenCalledWith({});
  expect(document.title).toBe("Redondeo en efectivo · Puro Sur");
});

test("keeps the authorizer of the manual discounts report in the address", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(null, "", "/reports/manual-discounts");
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByRole("table").getByText("Cliente frecuente")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: /Autorizante:/ }));
  await userEvent.click(screen.getByRole("option", { name: "Ana" }));

  await expect.poll(() => window.location.search).toBe(`?authorizedBy=${ANA_USER_ID}`);
});

test("rewrites a refused range of the manual discounts report out of the address", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(
    null,
    "",
    `/reports/manual-discounts?from=2026-10-08&to=2026-10-07&authorizedBy=${ANA_USER_ID}`,
  );

  await render(<App help={emptyHelp} services={services} />);

  await expect.poll(() => window.location.search).toBe(`?authorizedBy=${ANA_USER_ID}`);
  expect(services.manualDiscountsScreen.fetchManualDiscounts).toHaveBeenCalledWith({
    authorized_by: ANA_USER_ID,
  });
});

test("opens the average ticket report at its address and reads it from the cloud", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(null, "", "/reports/average-ticket");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect
    .element(screen.getByRole("heading", { name: "Ticket promedio", level: 1 }))
    .toBeVisible();
  await expect
    .element(screen.getByRole("table").getByText("Del 08/10/2026 al 14/10/2026"))
    .toBeVisible();
  expect(services.averageTicketScreen.fetchAverageTicket).toHaveBeenCalledWith({});
  expect(document.title).toBe("Ticket promedio · Puro Sur");
});

test("keeps the order of the average ticket report in the address", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(null, "", "/reports/average-ticket");
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect
    .element(screen.getByRole("table").getByText("Del 08/10/2026 al 14/10/2026"))
    .toBeVisible();

  await userEvent.click(
    screen.getByRole("table").getByRole("button", { name: "Importe", exact: true }),
  );

  await expect.poll(() => window.location.search).toBe("?sortBy=amount");
});

test("rewrites a refused range of the average ticket report out of the address", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(
    null,
    "",
    "/reports/average-ticket?from=2026-10-08&to=2026-10-07&sortBy=sales",
  );

  await render(<App help={emptyHelp} services={services} />);

  await expect.poll(() => window.location.search).toBe("?sortBy=sales");
  expect(services.averageTicketScreen.fetchAverageTicket).toHaveBeenCalledWith({});
});

test("keeps the filters of the sales by payment method report in the address", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(null, "", "/reports/sales-by-payment-method");
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByText("Efectivo")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: /Caja:/ }));
  await userEvent.click(screen.getByRole("option", { name: "Caja principal" }));

  await expect
    .poll(() => window.location.search)
    .toBe("?register=11111111-1111-4111-8111-111111111111");
});

test("keeps the filters of the report in the address", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(null, "", "/reports/sales-by-day");
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByText("02/10/2026")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: /Caja:/ }));
  await userEvent.click(screen.getByRole("option", { name: "Caja principal" }));

  await expect
    .poll(() => window.location.search)
    .toBe("?register=11111111-1111-4111-8111-111111111111");
});

test("hides the Reportes item in the rail for a user without the reports permission", async () => {
  const services = reportsServices(["stock_area", "stock_balances"]);
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("navigation", { name: "Áreas" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Reportes" }).query()).toBeNull();
});

test("shows the Reportes item in the rail to an Administrator", async () => {
  const services = reportsServices([]);
  vi.mocked(services.fetchSession).mockResolvedValue(openSession());
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("link", { name: "Reportes" })).toBeVisible();
});

test.each([
  "/reports",
  "/reports/sales-by-day",
  "/reports/sales-by-payment-method",
  "/reports/sales-by-product-and-category",
  "/reports/sales-by-cashier",
  "/reports/hand-typed-weights",
  "/reports/sales-by-promotion",
  "/reports/manual-discounts",
  "/reports/cash-rounding",
  "/reports/average-ticket",
  "/reports/returns",
])("sends a user without the reports permission who opens %s to Mi cuenta", async (path) => {
  const services = reportsServices(["stock_area"]);
  window.history.pushState(null, "", path);

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("tab", { name: "Passkeys y PIN" })).toBeVisible();
  expect(services.salesByDayScreen.fetchSalesReport).not.toHaveBeenCalled();
  expect(services.salesByPaymentMethodScreen.fetchSalesByPaymentMethod).not.toHaveBeenCalled();
  expect(
    services.salesByProductAndCategoryScreen.fetchSalesByProductAndCategory,
  ).not.toHaveBeenCalled();
  expect(services.salesByCashierScreen.fetchSalesByCashier).not.toHaveBeenCalled();
  expect(services.handTypedWeightsScreen.fetchHandTypedWeights).not.toHaveBeenCalled();
  expect(services.salesByPromotionScreen.fetchSalesByPromotion).not.toHaveBeenCalled();
  expect(services.manualDiscountsScreen.fetchManualDiscounts).not.toHaveBeenCalled();
  expect(services.cashRoundingScreen.fetchCashRounding).not.toHaveBeenCalled();
  expect(services.averageTicketScreen.fetchAverageTicket).not.toHaveBeenCalled();
  expect(services.returnsHistoryScreen.fetchReturnsReport).not.toHaveBeenCalled();
});

test("shows no open alerts count in Reportes' top bar", async () => {
  const services = reportsServices([]);
  vi.mocked(services.fetchSession).mockResolvedValue(openSession());
  window.history.pushState(null, "", "/reports");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect
    .element(screen.getByRole("heading", { name: "Ventas por día o por rango", level: 1 }))
    .toBeVisible();
  expect(services.homeScreen.fetchAlertsOverview).not.toHaveBeenCalled();
  expect(screen.getByText(/alertas? abiertas?/).query()).toBeNull();
});

test("keeps the hand-confirmed filter of the sales by payment method in the address", async () => {
  const services = reportsServices(["reports_area"]);
  vi.mocked(services.salesByPaymentMethodScreen.fetchHandConfirmedPayments).mockResolvedValue({
    kind: "ok",
    value: weekHandConfirmedReport,
  });
  window.history.pushState(null, "", "/reports/sales-by-payment-method");
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect
    .element(screen.getByRole("table", { name: "Ventas por medio de pago" }))
    .toBeVisible();

  await userEvent.click(screen.getByText("Confirmados a mano", { exact: true }));

  await expect.poll(() => window.location.search).toBe("?handConfirmed=true");
  await expect
    .element(screen.getByRole("table", { name: "Pagos confirmados a mano", exact: true }))
    .toBeVisible();
  expect(services.salesByPaymentMethodScreen.fetchHandConfirmedPayments).toHaveBeenCalledWith({});
});

test("drops from the address a method the sales by payment method offers only with the hand-confirmed filter", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(null, "", "/reports/sales-by-payment-method?method=TRANSFER");
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect
    .element(screen.getByRole("table", { name: "Ventas por medio de pago" }))
    .toBeVisible();

  await expect.poll(() => window.location.search).toBe("");
});

test("drops the method from the address when the hand-confirmed filter is turned off", async () => {
  const services = reportsServices(["reports_area"]);
  vi.mocked(services.salesByPaymentMethodScreen.fetchHandConfirmedPayments).mockResolvedValue({
    kind: "ok",
    value: weekHandConfirmedReport,
  });
  window.history.pushState(
    null,
    "",
    "/reports/sales-by-payment-method?handConfirmed=true&method=TRANSFER",
  );
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect
    .element(screen.getByRole("table", { name: "Pagos confirmados a mano", exact: true }))
    .toBeVisible();

  await userEvent.click(screen.getByText("Confirmados a mano", { exact: true }));

  await expect
    .element(screen.getByRole("table", { name: "Ventas por medio de pago" }))
    .toBeVisible();
  await expect.poll(() => window.location.search).toBe("");
});
