import type { Capability } from "@purosur/domain";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { issuedFiscalDocumentsReport } from "../fiscal/test-support/issued-fiscal-documents-report-fixtures";
import {
  weekHandConfirmedReport,
  weekPaymentsReport,
} from "../payments/test-support/payments-report-fixtures";
import { weekCashMovementsReport } from "../register/test-support/cash-movements-fixtures";
import { weekCashSessionClosesReport } from "../register/test-support/cash-session-closes-fixtures";
import { returnsReport } from "../returns/test-support/returns-fixtures";
import { handTypedWeightsReport } from "../sales/test-support/hand-typed-weights-fixtures";
import {
  ANA_USER_ID,
  averageTicketReport,
  cashierSalesReport,
  categoryProductsReport,
  manualDiscountsReport,
  promotionDiscountsReport,
  weekReport,
} from "../sales/test-support/sales-fixtures";
import { openSession } from "../sessions/test-support/open-session";
import { App } from "./app";
import { emptyHelp, resetPageState } from "./test-support/app";
import { createAppServices } from "./test-support/app-services";
import { registers } from "./test-support/report-fixtures";
import { opensOnlyScreens } from "./test-support/screen-routes";

opensOnlyScreens([
  "/",
  "/account",
  "/help",
  "/reports",
  "/reports/sales-by-day",
  "/reports/sales-by-payment-method",
  "/reports/hand-confirmed-payments",
  "/reports/cash-session-closes",
  "/reports/cash-movements",
  "/reports/sales-by-product-and-category",
  "/reports/sales-by-cashier",
  "/reports/hand-typed-weights",
  "/reports/sales-by-promotion",
  "/reports/manual-discounts",
  "/reports/average-ticket",
  "/reports/returns",
  "/reports/fiscal-documents",
]);

beforeEach(resetPageState);

function reportsServices(capabilities: Capability[]) {
  const services = createAppServices({
    fetchSession: vi.fn().mockResolvedValue(
      openSession({
        userId: "user-2",
        displayName: "Lucía Ferreyra",
        isAdministrator: false,
        capabilities,
      }),
    ),
  });
  vi.mocked(services.myAccountScreen.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [] });
  vi.mocked(services.salesByDayScreen.fetchSalesReport).mockResolvedValue({
    kind: "ok",
    value: weekReport,
  });
  vi.mocked(services.salesByPaymentMethodScreen.fetchSalesByPaymentMethod).mockResolvedValue({
    kind: "ok",
    value: weekPaymentsReport,
  });
  vi.mocked(services.handConfirmedPaymentsScreen.fetchHandConfirmedPayments).mockResolvedValue({
    kind: "ok",
    value: weekHandConfirmedReport,
  });
  vi.mocked(services.cashMovementsScreen.fetchCashMovements).mockResolvedValue({
    kind: "ok",
    value: weekCashMovementsReport,
  });
  vi.mocked(services.cashSessionClosesScreen.fetchCashSessionCloses).mockResolvedValue({
    kind: "ok",
    value: weekCashSessionClosesReport,
  });
  vi.mocked(
    services.salesByProductAndCategoryScreen.fetchSalesByProductAndCategory,
  ).mockResolvedValue({ kind: "ok", value: categoryProductsReport });
  vi.mocked(services.salesByCashierScreen.fetchSalesByCashier).mockResolvedValue({
    kind: "ok",
    value: cashierSalesReport,
  });
  vi.mocked(services.handTypedWeightsScreen.fetchHandTypedWeights).mockResolvedValue({
    kind: "ok",
    value: handTypedWeightsReport,
  });
  vi.mocked(services.salesByPromotionScreen.fetchSalesByPromotion).mockResolvedValue({
    kind: "ok",
    value: promotionDiscountsReport,
  });
  vi.mocked(services.manualDiscountsScreen.fetchManualDiscounts).mockResolvedValue({
    kind: "ok",
    value: manualDiscountsReport,
  });
  vi.mocked(services.averageTicketScreen.fetchAverageTicket).mockResolvedValue({
    kind: "ok",
    value: averageTicketReport,
  });
  vi.mocked(services.returnsReportScreen.fetchReturnsReport).mockResolvedValue({
    kind: "ok",
    value: returnsReport,
  });
  vi.mocked(
    services.issuedFiscalDocumentsReportScreen.fetchIssuedFiscalDocumentsReport,
  ).mockResolvedValue({ kind: "ok", value: issuedFiscalDocumentsReport });
  vi.mocked(services.reportRegisterFilter.fetchReportRegisters).mockResolvedValue({
    kind: "ok",
    value: registers,
  });
  return services;
}

test("opens the list of reports from the rail's Reportes item", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={services} />);
  await userEvent.click(screen.getByRole("link", { name: "Reportes" }));

  await expect.element(screen.getByRole("heading", { name: "Reportes", level: 1 })).toBeVisible();
  expect(window.location.pathname).toBe("/reports");
  const sections = screen.getByRole("navigation", { name: "Reportes" });
  await expect.element(sections.getByRole("link", { name: "Todos los reportes" })).toBeVisible();
  await expect
    .element(sections.getByRole("link", { name: "Ventas por día o por rango" }))
    .toBeVisible();
  await expect
    .element(sections.getByRole("link", { name: "Ventas por medio de pago" }))
    .toBeVisible();
  await expect
    .element(sections.getByRole("link", { name: "Pagos confirmados a mano" }))
    .toBeVisible();
  await expect.element(sections.getByRole("link", { name: "Cierres de sesión" })).toBeVisible();
  await expect
    .element(sections.getByRole("link", { name: "Ventas por producto y por categoría" }))
    .toBeVisible();
  await expect.element(sections.getByRole("link", { name: "Ventas por cajero" })).toBeVisible();
  await expect.element(sections.getByRole("link", { name: "Ticket promedio" })).toBeVisible();
});

test("lists the returns report beside the others for someone who can see both", async () => {
  const services = reportsServices(["reports_area", "returns_report"]);
  window.history.pushState(null, "", "/reports");

  const screen = await render(<App help={emptyHelp} services={services} />);

  const sections = screen.getByRole("navigation", { name: "Reportes" });
  await expect.element(sections.getByRole("link", { name: "Devoluciones" })).toBeVisible();
  await expect.element(sections.getByRole("link", { name: "Todos los reportes" })).toBeVisible();
  await expect
    .element(screen.getByRole("main").getByRole("link", { name: "Devoluciones" }))
    .toBeVisible();
});

test("opens the returns report from the list and reads it from the cloud", async () => {
  const services = reportsServices(["reports_area", "returns_report"]);
  window.history.pushState(null, "", "/reports");

  const screen = await render(<App help={emptyHelp} services={services} />);
  await userEvent.click(screen.getByRole("main").getByRole("link", { name: "Devoluciones" }));

  await expect
    .element(screen.getByRole("heading", { name: "Devoluciones", level: 1 }))
    .toBeVisible();
  expect(window.location.pathname).toBe("/reports/returns");
  await expect
    .element(
      screen
        .getByRole("table", { name: "Devoluciones iniciadas con el número tipeado" })
        .getByText("Beto"),
    )
    .toBeVisible();
  expect(services.returnsReportScreen.fetchReturnsReport).toHaveBeenCalledWith({});
  expect(document.title).toBe("Devoluciones · Puro Sur");
});

test("opens the issued fiscal documents report from the list and reads it from the cloud", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(null, "", "/reports");

  const screen = await render(<App help={emptyHelp} services={services} />);
  await userEvent.click(
    screen.getByRole("main").getByRole("link", { name: "Comprobantes emitidos" }),
  );

  await expect
    .element(screen.getByRole("heading", { name: "Comprobantes emitidos", level: 1 }))
    .toBeVisible();
  expect(window.location.pathname).toBe("/reports/fiscal-documents");
  await expect
    .element(
      screen.getByRole("table", { name: "Comprobantes emitidos" }).getByText("Nota de crédito C"),
    )
    .toBeVisible();
  expect(
    services.issuedFiscalDocumentsReportScreen.fetchIssuedFiscalDocumentsReport,
  ).toHaveBeenCalledWith({});
  expect(document.title).toBe("Comprobantes emitidos · Puro Sur");
});

test("lists the issued fiscal documents report in the reports section column", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(null, "", "/reports");

  const screen = await render(<App help={emptyHelp} services={services} />);

  const sections = screen.getByRole("navigation", { name: "Reportes" });
  await expect.element(sections.getByRole("link", { name: "Comprobantes emitidos" })).toBeVisible();
});

test("keeps the issued fiscal documents report's filters in the address", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(null, "", "/reports/fiscal-documents");
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByRole("table", { name: "Comprobantes emitidos" })).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: /Caja:/ }));
  await userEvent.click(screen.getByRole("option", { name: "Caja principal" }));

  await expect
    .poll(() => window.location.search)
    .toBe("?register=11111111-1111-4111-8111-111111111111");
});

test("keeps the returns report's filters in the address", async () => {
  const services = reportsServices(["returns_report"]);
  window.history.pushState(null, "", "/reports/returns");
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByRole("table").first().getByText("Beto")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: /Caja:/ }));
  await userEvent.click(screen.getByRole("option", { name: "Caja principal" }));

  await expect
    .poll(() => window.location.search)
    .toBe("?register=11111111-1111-4111-8111-111111111111");
});

test("takes someone who can only see the returns report to it from the rail's Reportes item", async () => {
  const services = reportsServices(["returns_report"]);
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={services} />);
  await userEvent.click(screen.getByRole("link", { name: "Reportes" }));

  await expect
    .element(screen.getByRole("heading", { name: "Devoluciones", level: 1 }))
    .toBeVisible();
  expect(window.location.pathname).toBe("/reports/returns");
  const sections = screen.getByRole("navigation", { name: "Reportes" });
  await expect.element(sections.getByRole("link", { name: "Devoluciones" })).toBeVisible();
  expect(sections.getByRole("link", { name: "Todos los reportes" }).query()).toBeNull();
  expect(sections.getByRole("link", { name: "Ventas por cajero" }).query()).toBeNull();
  expect(sections.getByRole("link", { name: "Stock actual valorizado" }).query()).toBeNull();
});

test("sends someone who can only see the returns report away from the list of reports", async () => {
  const services = reportsServices(["returns_report"]);
  window.history.pushState(null, "", "/reports");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();
});

test("leaves the returns report out of the list for someone without its permission", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(null, "", "/reports");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect
    .element(
      screen.getByRole("navigation", { name: "Reportes" }).getByRole("link", {
        name: "Todos los reportes",
      }),
    )
    .toBeVisible();
  expect(screen.getByRole("link", { name: "Devoluciones" }).query()).toBeNull();
});

test("sends someone with the reports permission but not the returns one away from the returns report", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(null, "", "/reports/returns");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();
  expect(services.returnsReportScreen.fetchReturnsReport).not.toHaveBeenCalled();
});

test("opens the sales by day report from the list and reads it from the cloud", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(null, "", "/reports");

  const screen = await render(<App help={emptyHelp} services={services} />);
  await userEvent.click(
    screen.getByRole("main").getByRole("link", { name: "Ventas por día o por rango" }),
  );

  await expect
    .element(screen.getByRole("heading", { name: "Ventas por día o por rango", level: 1 }))
    .toBeVisible();
  expect(window.location.pathname).toBe("/reports/sales-by-day");
  await expect.element(screen.getByText("02/10/2026")).toBeVisible();
  expect(services.salesByDayScreen.fetchSalesReport).toHaveBeenCalledWith({});
  expect(document.title).toBe("Ventas por día o por rango · Puro Sur");
});

test("opens the sales by payment method report from the list and reads it from the cloud", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(null, "", "/reports");

  const screen = await render(<App help={emptyHelp} services={services} />);
  await userEvent.click(
    screen.getByRole("main").getByRole("link", { name: "Ventas por medio de pago" }),
  );

  await expect
    .element(screen.getByRole("heading", { name: "Ventas por medio de pago", level: 1 }))
    .toBeVisible();
  expect(window.location.pathname).toBe("/reports/sales-by-payment-method");
  await expect.element(screen.getByText("Efectivo")).toBeVisible();
  expect(services.salesByPaymentMethodScreen.fetchSalesByPaymentMethod).toHaveBeenCalledWith({});
  expect(document.title).toBe("Ventas por medio de pago · Puro Sur");
});

test("opens the payments confirmed by hand report from the list and reads it from the cloud", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(null, "", "/reports");

  const screen = await render(<App help={emptyHelp} services={services} />);
  await userEvent.click(
    screen.getByRole("main").getByRole("link", { name: "Pagos confirmados a mano" }),
  );

  await expect
    .element(screen.getByRole("heading", { name: "Pagos confirmados a mano", level: 1 }))
    .toBeVisible();
  expect(window.location.pathname).toBe("/reports/hand-confirmed-payments");
  await expect.element(screen.getByText("Operación 000007")).toBeVisible();
  expect(services.handConfirmedPaymentsScreen.fetchHandConfirmedPayments).toHaveBeenCalledWith({});
  expect(document.title).toBe("Pagos confirmados a mano · Puro Sur");
});

test("opens the cash session closes report from the list and reads it from the cloud", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(null, "", "/reports");

  const screen = await render(<App help={emptyHelp} services={services} />);
  await userEvent.click(screen.getByRole("main").getByRole("link", { name: "Cierres de sesión" }));

  await expect
    .element(screen.getByRole("heading", { name: "Cierres de sesión", level: 1 }))
    .toBeVisible();
  expect(window.location.pathname).toBe("/reports/cash-session-closes");
  await expect.element(screen.getByText("Cerró: Beto")).toBeVisible();
  expect(services.cashSessionClosesScreen.fetchCashSessionCloses).toHaveBeenCalledWith({});
  expect(document.title).toBe("Cierres de sesión · Puro Sur");
});

test("opens the cash movements report from the list and reads it from the cloud", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(null, "", "/reports");

  const screen = await render(<App help={emptyHelp} services={services} />);
  await userEvent.click(
    screen.getByRole("main").getByRole("link", { name: "Movimientos de caja" }),
  );

  await expect
    .element(screen.getByRole("heading", { name: "Movimientos de caja", level: 1 }))
    .toBeVisible();
  expect(window.location.pathname).toBe("/reports/cash-movements");
  await expect.element(screen.getByText("Compra de hielo")).toBeVisible();
  expect(services.cashMovementsScreen.fetchCashMovements).toHaveBeenCalledWith({});
  expect(document.title).toBe("Movimientos de caja · Puro Sur");
});

test("keeps the cash movements report's filters after following its own side column link", async () => {
  const url = "/reports/cash-movements?from=2026-10-01&to=2026-10-07";
  const services = reportsServices(["reports_area"]);
  window.history.pushState(null, "", url);
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByText("Compra de hielo")).toBeVisible();
  const sectionLink = screen
    .getByRole("navigation", { name: "Reportes" })
    .getByRole("link", { name: "Movimientos de caja" });
  await expect.element(sectionLink).toHaveAttribute("href", url);

  await userEvent.click(sectionLink);

  await expect.poll(() => `${window.location.pathname}${window.location.search}`).toBe(url);
});

test("keeps the method of the payments confirmed by hand report in the address", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(null, "", "/reports/hand-confirmed-payments");
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByText("Operación 000007")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: /Medio:/ }));
  await userEvent.click(screen.getByRole("option", { name: "Transferencia" }));

  await expect.poll(() => window.location.search).toBe("?method=TRANSFER");
  expect(services.handConfirmedPaymentsScreen.fetchHandConfirmedPayments).toHaveBeenLastCalledWith({
    method: "TRANSFER",
  });
});

test("opens the sales by product and category report from the list and reads it from the cloud", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(null, "", "/reports");

  const screen = await render(<App help={emptyHelp} services={services} />);
  await userEvent.click(
    screen.getByRole("main").getByRole("link", { name: "Ventas por producto y por categoría" }),
  );

  await expect
    .element(screen.getByRole("heading", { name: "Ventas por producto y por categoría", level: 1 }))
    .toBeVisible();
  expect(window.location.pathname).toBe("/reports/sales-by-product-and-category");
  await expect.element(screen.getByText("Fiambres")).toBeVisible();
  expect(
    services.salesByProductAndCategoryScreen.fetchSalesByProductAndCategory,
  ).toHaveBeenCalledWith({ group: "category" });
  expect(document.title).toBe("Ventas por producto y por categoría · Puro Sur");
});

test("keeps the sales by product and category report's filters after following its own side column link", async () => {
  const url = "/reports/sales-by-product-and-category?group=product&sortBy=name";
  const services = reportsServices(["reports_area"]);
  window.history.pushState(null, "", url);
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByText("Fiambres")).toBeVisible();
  const sectionLink = screen
    .getByRole("navigation", { name: "Reportes" })
    .getByRole("link", { name: "Ventas por producto y por categoría" });
  await expect.element(sectionLink).toHaveAttribute("href", url);

  await userEvent.click(sectionLink);

  await expect.poll(() => `${window.location.pathname}${window.location.search}`).toBe(url);
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

test("opens the sales by cashier report from the list and reads it from the cloud", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(null, "", "/reports");

  const screen = await render(<App help={emptyHelp} services={services} />);
  await userEvent.click(screen.getByRole("main").getByRole("link", { name: "Ventas por cajero" }));

  await expect
    .element(screen.getByRole("heading", { name: "Ventas por cajero", level: 1 }))
    .toBeVisible();
  expect(window.location.pathname).toBe("/reports/sales-by-cashier");
  await expect.element(screen.getByRole("table").getByText("Beto")).toBeVisible();
  expect(services.salesByCashierScreen.fetchSalesByCashier).toHaveBeenCalledWith({});
  expect(document.title).toBe("Ventas por cajero · Puro Sur");
});

test("keeps the sales by cashier report's filters after following its own side column link", async () => {
  const url = "/reports/sales-by-cashier?sort=ascending&sortBy=averageTicket";
  const services = reportsServices(["reports_area"]);
  window.history.pushState(null, "", url);
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByRole("table").getByText("Beto")).toBeVisible();
  const sectionLink = screen
    .getByRole("navigation", { name: "Reportes" })
    .getByRole("link", { name: "Ventas por cajero" });
  await expect.element(sectionLink).toHaveAttribute("href", url);

  await userEvent.click(sectionLink);

  await expect.poll(() => `${window.location.pathname}${window.location.search}`).toBe(url);
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

test("opens the weights typed by hand report from the list and reads it from the cloud", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(null, "", "/reports");

  const screen = await render(<App help={emptyHelp} services={services} />);
  await userEvent.click(
    screen.getByRole("main").getByRole("link", { name: "Pesos tipeados a mano" }),
  );

  await expect
    .element(screen.getByRole("heading", { name: "Pesos tipeados a mano", level: 1 }))
    .toBeVisible();
  expect(window.location.pathname).toBe("/reports/hand-typed-weights");
  await expect.element(screen.getByRole("table").first().getByText("Beto")).toBeVisible();
  expect(services.handTypedWeightsScreen.fetchHandTypedWeights).toHaveBeenCalledWith({});
  expect(document.title).toBe("Pesos tipeados a mano · Puro Sur");
});

test("keeps the weights typed by hand report's filters after following its own side column link", async () => {
  const url = "/reports/hand-typed-weights?from=2026-10-01&to=2026-10-07";
  const services = reportsServices(["reports_area"]);
  window.history.pushState(null, "", url);
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByRole("table").first().getByText("Beto")).toBeVisible();
  const sectionLink = screen
    .getByRole("navigation", { name: "Reportes" })
    .getByRole("link", { name: "Pesos tipeados a mano" });
  await expect.element(sectionLink).toHaveAttribute("href", url);

  await userEvent.click(sectionLink);

  await expect.poll(() => `${window.location.pathname}${window.location.search}`).toBe(url);
});

test("opens the discounts by promotion report from the list and reads it from the cloud", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(null, "", "/reports");

  const screen = await render(<App help={emptyHelp} services={services} />);
  await userEvent.click(
    screen.getByRole("main").getByRole("link", { name: "Descuentos por promoción" }),
  );

  await expect
    .element(screen.getByRole("heading", { name: "Descuentos por promoción", level: 1 }))
    .toBeVisible();
  expect(window.location.pathname).toBe("/reports/sales-by-promotion");
  await expect.element(screen.getByRole("table").getByText("Tres por dos")).toBeVisible();
  expect(services.salesByPromotionScreen.fetchSalesByPromotion).toHaveBeenCalledWith({});
  expect(document.title).toBe("Descuentos por promoción · Puro Sur");
});

test("keeps the discounts by promotion report's filters after following its own side column link", async () => {
  const url = "/reports/sales-by-promotion?sort=ascending&sortBy=lines";
  const services = reportsServices(["reports_area"]);
  window.history.pushState(null, "", url);
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByRole("table").getByText("Tres por dos")).toBeVisible();
  const sectionLink = screen
    .getByRole("navigation", { name: "Reportes" })
    .getByRole("link", { name: "Descuentos por promoción" });
  await expect.element(sectionLink).toHaveAttribute("href", url);

  await userEvent.click(sectionLink);

  await expect.poll(() => `${window.location.pathname}${window.location.search}`).toBe(url);
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

test("opens the manual discounts report from the list and reads it from the cloud", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(null, "", "/reports");

  const screen = await render(<App help={emptyHelp} services={services} />);
  await userEvent.click(
    screen.getByRole("main").getByRole("link", { name: "Descuentos manuales y sobre el total" }),
  );

  await expect
    .element(
      screen.getByRole("heading", { name: "Descuentos manuales y sobre el total", level: 1 }),
    )
    .toBeVisible();
  expect(window.location.pathname).toBe("/reports/manual-discounts");
  await expect.element(screen.getByRole("table").getByText("Cliente frecuente")).toBeVisible();
  expect(services.manualDiscountsScreen.fetchManualDiscounts).toHaveBeenCalledWith({});
  expect(document.title).toBe("Descuentos manuales y sobre el total · Puro Sur");
});

test("keeps the manual discounts report's filters after following its own side column link", async () => {
  const url = `/reports/manual-discounts?authorizedBy=${ANA_USER_ID}`;
  const services = reportsServices(["reports_area"]);
  window.history.pushState(null, "", url);
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByRole("table").getByText("Envase dañado")).toBeVisible();
  const sectionLink = screen
    .getByRole("navigation", { name: "Reportes" })
    .getByRole("link", { name: "Descuentos manuales y sobre el total" });
  await expect.element(sectionLink).toHaveAttribute("href", url);

  await userEvent.click(sectionLink);

  await expect.poll(() => `${window.location.pathname}${window.location.search}`).toBe(url);
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

test("opens the average ticket report from the list and reads it from the cloud", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(null, "", "/reports");

  const screen = await render(<App help={emptyHelp} services={services} />);
  await userEvent.click(screen.getByRole("main").getByRole("link", { name: "Ticket promedio" }));

  await expect
    .element(screen.getByRole("heading", { name: "Ticket promedio", level: 1 }))
    .toBeVisible();
  expect(window.location.pathname).toBe("/reports/average-ticket");
  await expect
    .element(screen.getByRole("table").getByText("Del 08/10/2026 al 14/10/2026"))
    .toBeVisible();
  expect(services.averageTicketScreen.fetchAverageTicket).toHaveBeenCalledWith({});
  expect(document.title).toBe("Ticket promedio · Puro Sur");
});

test("keeps the average ticket report's filters after following its own side column link", async () => {
  const url = "/reports/average-ticket?sort=ascending&sortBy=amount";
  const services = reportsServices(["reports_area"]);
  window.history.pushState(null, "", url);
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect
    .element(screen.getByRole("table").getByText("Del 08/10/2026 al 14/10/2026"))
    .toBeVisible();
  const sectionLink = screen
    .getByRole("navigation", { name: "Reportes" })
    .getByRole("link", { name: "Ticket promedio" });
  await expect.element(sectionLink).toHaveAttribute("href", url);

  await userEvent.click(sectionLink);

  await expect.poll(() => `${window.location.pathname}${window.location.search}`).toBe(url);
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

test("keeps the sales by payment method report's filters after following its own side column link", async () => {
  const url = "/reports/sales-by-payment-method?sortBy=method";
  const services = reportsServices(["reports_area"]);
  window.history.pushState(null, "", url);
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByText("Efectivo")).toBeVisible();
  const sectionLink = screen
    .getByRole("navigation", { name: "Reportes" })
    .getByRole("link", { name: "Ventas por medio de pago" });
  await expect.element(sectionLink).toHaveAttribute("href", url);

  await userEvent.click(sectionLink);

  await expect.poll(() => `${window.location.pathname}${window.location.search}`).toBe(url);
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
  "/reports/hand-confirmed-payments",
  "/reports/cash-session-closes",
  "/reports/cash-movements",
  "/reports/sales-by-product-and-category",
  "/reports/sales-by-cashier",
  "/reports/hand-typed-weights",
  "/reports/sales-by-promotion",
  "/reports/manual-discounts",
  "/reports/average-ticket",
  "/reports/returns",
  "/reports/fiscal-documents",
])("sends a user without the reports permission who opens %s to Mi cuenta", async (path) => {
  const services = reportsServices(["stock_area"]);
  window.history.pushState(null, "", path);

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();
  expect(services.salesByDayScreen.fetchSalesReport).not.toHaveBeenCalled();
  expect(services.salesByPaymentMethodScreen.fetchSalesByPaymentMethod).not.toHaveBeenCalled();
  expect(services.handConfirmedPaymentsScreen.fetchHandConfirmedPayments).not.toHaveBeenCalled();
  expect(services.cashSessionClosesScreen.fetchCashSessionCloses).not.toHaveBeenCalled();
  expect(services.cashMovementsScreen.fetchCashMovements).not.toHaveBeenCalled();
  expect(
    services.salesByProductAndCategoryScreen.fetchSalesByProductAndCategory,
  ).not.toHaveBeenCalled();
  expect(services.salesByCashierScreen.fetchSalesByCashier).not.toHaveBeenCalled();
  expect(services.handTypedWeightsScreen.fetchHandTypedWeights).not.toHaveBeenCalled();
  expect(services.salesByPromotionScreen.fetchSalesByPromotion).not.toHaveBeenCalled();
  expect(services.manualDiscountsScreen.fetchManualDiscounts).not.toHaveBeenCalled();
  expect(services.averageTicketScreen.fetchAverageTicket).not.toHaveBeenCalled();
  expect(services.returnsReportScreen.fetchReturnsReport).not.toHaveBeenCalled();
  expect(
    services.issuedFiscalDocumentsReportScreen.fetchIssuedFiscalDocumentsReport,
  ).not.toHaveBeenCalled();
});
