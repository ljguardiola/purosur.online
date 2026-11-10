import { beforeEach, expect, test } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { App } from "./app";
import { emptyHelp, resetPageState } from "./test-support/app";
import { FRONT_REGISTER_ID } from "./test-support/report-fixtures";
import { reportsServices } from "./test-support/reports-services";
import { opensOnlyScreens } from "./test-support/screen-routes";

opensOnlyScreens([
  "/",
  "/help",
  "/reports/sales-by-day",
  "/reports/sales-by-payment-method",
  "/reports/sales-by-product-and-category",
  "/reports/sales-by-cashier",
  "/reports/average-ticket",
  "/reports/sales-by-promotion",
  "/reports/manual-discounts",
  "/reports/cash-rounding",
  "/reports/hand-typed-weights",
  "/reports/margin",
  "/reports/mercado-pago-charge-costs",
]);

beforeEach(resetPageState);

function location() {
  return `${window.location.pathname}${window.location.search}`;
}

function searchOf(address: string) {
  return Object.fromEntries(new URL(address, "http://localhost").searchParams);
}

const PERIOD = { from: "2026-10-01", to: "2026-10-07" };

test("opens Ventas > Por día from the rail's Reportes item", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={services} />);
  await userEvent.click(
    screen.getByRole("navigation", { name: "Áreas" }).getByRole("link", { name: "Reportes" }),
  );

  await expect
    .element(screen.getByRole("heading", { name: "Ventas por día o por rango", level: 1 }))
    .toBeVisible();
  expect(location()).toBe("/reports/sales-by-day");
  await expect.element(screen.getByText("Reportes · Ventas", { exact: true })).toBeVisible();
  await expect.element(screen.getByRole("tab", { name: "Ventas", selected: true })).toBeVisible();
  await expect.element(screen.getByRole("radio", { name: "Por día" })).toBeChecked();
});

test("sends the address of the reports to the first view the person may see", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(null, "", "/reports");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect
    .element(screen.getByRole("heading", { name: "Ventas por día o por rango", level: 1 }))
    .toBeVisible();
  expect(location()).toBe("/reports/sales-by-day");
});

test("shows the three tabs, in order, to a person with the reports area", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(null, "", "/reports/sales-by-day");

  const screen = await render(<App help={emptyHelp} services={services} />);

  const tabs = screen.getByRole("tablist", { name: "Secciones de Reportes" });
  await expect.element(tabs).toBeVisible();
  expect(tabs.getByRole("tab").elements()).toHaveLength(3);
  await expect.element(tabs.getByRole("tab").nth(0)).toHaveAccessibleName("Ventas");
  await expect.element(tabs.getByRole("tab").nth(1)).toHaveAccessibleName("Descuentos y control");
  await expect.element(tabs.getByRole("tab").nth(2)).toHaveAccessibleName("Rentabilidad");
});

test("holds the rail's Reportes column to a single Reportes item", async () => {
  const services = reportsServices(["reports_area", "mercado_pago_charge_costs"]);
  window.history.pushState(null, "", "/reports/sales-by-day");

  const screen = await render(<App help={emptyHelp} services={services} />);

  const column = screen.getByRole("navigation", { name: "Reportes" });
  expect(column.getByRole("link").elements()).toHaveLength(1);
  await expect.element(column.getByRole("link", { name: "Reportes" })).toBeVisible();
  expect(screen.getByText("Todos los reportes").query()).toBeNull();
});

test("offers the five views of Ventas in a segmented control under the tabs", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(null, "", "/reports/sales-by-day");

  const screen = await render(<App help={emptyHelp} services={services} />);

  const views = screen.getByRole("radiogroup", { name: "Reporte" });
  expect(views.getByRole("radio").elements()).toHaveLength(5);
  for (const label of [
    "Por día",
    "Por medio de pago",
    "Por producto y categoría",
    "Por cajero",
    "Ticket promedio",
  ]) {
    await expect.element(views.getByRole("radio", { name: label })).toBeVisible();
  }
});

test("fits the five views of Ventas in the width of the content", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(null, "", "/reports/sales-by-day");

  const screen = await render(<App help={emptyHelp} services={services} />);

  const views = screen.getByRole("radiogroup", { name: "Reporte" });
  await expect.element(views).toBeVisible();
  const group = views.element() as HTMLElement;
  const main = screen.getByRole("main").element() as HTMLElement;
  expect(group.getBoundingClientRect().right).toBeLessThanOrEqual(
    main.getBoundingClientRect().right,
  );
  expect(group.scrollWidth).toBeLessThanOrEqual(group.clientWidth);
});

test("offers the four views of Descuentos y control and the two of Rentabilidad", async () => {
  const services = reportsServices(["reports_area", "mercado_pago_charge_costs"]);
  window.history.pushState(null, "", "/reports/sales-by-promotion");

  const screen = await render(<App help={emptyHelp} services={services} />);

  const discounts = screen.getByRole("radiogroup", { name: "Reporte" });
  expect(discounts.getByRole("radio").elements()).toHaveLength(4);
  for (const label of [
    "Por promoción",
    "Manuales y sobre el total",
    "Redondeo en efectivo",
    "Pesos tipeados a mano",
  ]) {
    await expect.element(discounts.getByRole("radio", { name: label })).toBeVisible();
  }

  await userEvent.click(screen.getByRole("tab", { name: "Rentabilidad" }));

  const profitability = screen.getByRole("radiogroup", { name: "Reporte" });
  expect(profitability.getByRole("radio").elements()).toHaveLength(2);
  await expect
    .element(profitability.getByRole("radio", { name: "Margen por producto y categoría" }))
    .toBeVisible();
  await expect
    .element(profitability.getByRole("radio", { name: "Costos de Mercado Pago" }))
    .toBeVisible();
});

test("opens the view a segmented control option names", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(null, "", "/reports/sales-by-day");
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByText("02/10/2026")).toBeVisible();

  await userEvent.click(screen.getByRole("radio", { name: "Por medio de pago" }), { force: true });

  await expect
    .element(screen.getByRole("heading", { name: "Ventas por medio de pago", level: 1 }))
    .toBeVisible();
  expect(location()).toBe("/reports/sales-by-payment-method");
  await expect.element(screen.getByRole("radio", { name: "Por medio de pago" })).toBeChecked();
  await expect.element(screen.getByText("Efectivo")).toBeVisible();
});

test("opens a tab on its first view", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(null, "", "/reports/sales-by-day");
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByText("02/10/2026")).toBeVisible();

  await userEvent.click(screen.getByRole("tab", { name: "Descuentos y control" }));

  await expect
    .element(screen.getByRole("heading", { name: "Descuentos por promoción", level: 1 }))
    .toBeVisible();
  expect(location()).toBe("/reports/sales-by-promotion");
  await expect
    .element(screen.getByRole("tab", { name: "Descuentos y control", selected: true }))
    .toBeVisible();
  await expect
    .element(screen.getByText("Reportes · Descuentos y control", { exact: true }))
    .toBeVisible();
});

test("keeps the period and the register when moving to another tab", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(
    null,
    "",
    `/reports/sales-by-day?from=${PERIOD.from}&to=${PERIOD.to}&register=${FRONT_REGISTER_ID}`,
  );
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByText("02/10/2026")).toBeVisible();

  await userEvent.click(screen.getByRole("tab", { name: "Descuentos y control" }));

  await expect
    .element(screen.getByRole("heading", { name: "Descuentos por promoción", level: 1 }))
    .toBeVisible();
  expect(window.location.pathname).toBe("/reports/sales-by-promotion");
  expect(searchOf(location())).toEqual({ ...PERIOD, register: FRONT_REGISTER_ID });
  await expect
    .poll(() => services.salesByPromotionScreen.fetchSalesByPromotion)
    .toHaveBeenCalledWith({ ...PERIOD, register_id: FRONT_REGISTER_ID });
});

test("keeps the period and the register when moving to another view", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(
    null,
    "",
    `/reports/sales-by-day?from=${PERIOD.from}&to=${PERIOD.to}&register=${FRONT_REGISTER_ID}`,
  );
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByText("02/10/2026")).toBeVisible();

  await userEvent.click(screen.getByRole("radio", { name: "Por cajero" }), { force: true });

  await expect
    .element(screen.getByRole("heading", { name: "Ventas por cajero", level: 1 }))
    .toBeVisible();
  expect(window.location.pathname).toBe("/reports/sales-by-cashier");
  expect(searchOf(location())).toEqual({ ...PERIOD, register: FRONT_REGISTER_ID });
});

test("drops what only the view left uses when moving to another view", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(
    null,
    "",
    `/reports/sales-by-product-and-category?from=${PERIOD.from}&to=${PERIOD.to}&group=product&sortBy=name`,
  );
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByText("Fiambres")).toBeVisible();

  await userEvent.click(screen.getByRole("radio", { name: "Por cajero" }), { force: true });

  await expect
    .element(screen.getByRole("heading", { name: "Ventas por cajero", level: 1 }))
    .toBeVisible();
  expect(searchOf(location())).toEqual(PERIOD);
});

test("keeps the period when moving back to the view that was left", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(null, "", `/reports/sales-by-day?from=${PERIOD.from}&to=${PERIOD.to}`);
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByText("02/10/2026")).toBeVisible();

  await userEvent.click(screen.getByRole("tab", { name: "Rentabilidad" }));
  await expect
    .element(screen.getByRole("heading", { name: "Margen por producto y por categoría", level: 1 }))
    .toBeVisible();
  await userEvent.click(screen.getByRole("tab", { name: "Ventas" }));

  await expect
    .element(screen.getByRole("heading", { name: "Ventas por día o por rango", level: 1 }))
    .toBeVisible();
  expect(searchOf(location())).toEqual(PERIOD);
});

test.each([
  {
    path: "/reports/sales-by-day",
    tab: "Ventas",
    title: "Ventas por día o por rango",
    option: "Por día",
  },
  {
    path: "/reports/sales-by-payment-method",
    tab: "Ventas",
    title: "Ventas por medio de pago",
    option: "Por medio de pago",
  },
  {
    path: "/reports/sales-by-product-and-category",
    tab: "Ventas",
    title: "Ventas por producto y por categoría",
    option: "Por producto y categoría",
  },
  {
    path: "/reports/sales-by-cashier",
    tab: "Ventas",
    title: "Ventas por cajero",
    option: "Por cajero",
  },
  {
    path: "/reports/average-ticket",
    tab: "Ventas",
    title: "Ticket promedio",
    option: "Ticket promedio",
  },
  {
    path: "/reports/sales-by-promotion",
    tab: "Descuentos y control",
    title: "Descuentos por promoción",
    option: "Por promoción",
  },
  {
    path: "/reports/manual-discounts",
    tab: "Descuentos y control",
    title: "Descuentos manuales y sobre el total",
    option: "Manuales y sobre el total",
  },
  {
    path: "/reports/cash-rounding",
    tab: "Descuentos y control",
    title: "Redondeo en efectivo",
    option: "Redondeo en efectivo",
  },
  {
    path: "/reports/hand-typed-weights",
    tab: "Descuentos y control",
    title: "Pesos tipeados a mano",
    option: "Pesos tipeados a mano",
  },
  {
    path: "/reports/margin",
    tab: "Rentabilidad",
    title: "Margen por producto y por categoría",
    option: "Margen por producto y categoría",
  },
  {
    path: "/reports/mercado-pago-charge-costs",
    tab: "Rentabilidad",
    title: "Costos de Mercado Pago",
    option: "Costos de Mercado Pago",
  },
])("keeps $path working, under $tab, titled $title", async ({ path, tab, title, option }) => {
  const services = reportsServices(["reports_area", "mercado_pago_charge_costs"]);
  window.history.pushState(null, "", path);

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: title, level: 1 })).toBeVisible();
  expect(window.location.pathname).toBe(path);
  await expect.element(screen.getByText(`Reportes · ${tab}`, { exact: true })).toBeVisible();
  await expect.element(screen.getByRole("tab", { name: tab, selected: true })).toBeVisible();
  await expect.element(screen.getByRole("radio", { name: option })).toBeChecked();
});

test("shows only Rentabilidad, on the charge costs, to a person with only that permission", async () => {
  const services = reportsServices(["mercado_pago_charge_costs"]);
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={services} />);
  const areas = screen.getByRole("navigation", { name: "Áreas" });
  await expect
    .element(areas.getByRole("link", { name: "Reportes", exact: true }))
    .toHaveAttribute("href", "/reports");
  await userEvent.click(areas.getByRole("link", { name: "Reportes", exact: true }));

  await expect
    .element(screen.getByRole("heading", { name: "Costos de Mercado Pago", level: 1 }))
    .toBeVisible();
  expect(location()).toBe("/reports/mercado-pago-charge-costs");
  await expect.element(screen.getByText("Reportes · Rentabilidad", { exact: true })).toBeVisible();
  expect(
    screen.getByRole("tablist", { name: "Secciones de Reportes" }).getByRole("tab").elements(),
  ).toHaveLength(1);
  await expect
    .element(screen.getByRole("tab", { name: "Rentabilidad", selected: true }))
    .toBeVisible();
  expect(screen.getByRole("radiogroup", { name: "Reporte" }).query()).toBeNull();
  expect(services.salesByDayScreen.fetchSalesReport).not.toHaveBeenCalled();
});

test("sends a person with only the charge costs permission from another report to Rentabilidad", async () => {
  const services = reportsServices(["mercado_pago_charge_costs"]);
  window.history.pushState(null, "", "/reports/sales-by-day");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect
    .element(screen.getByRole("heading", { name: "Costos de Mercado Pago", level: 1 }))
    .toBeVisible();
  expect(window.location.pathname).toBe("/reports/mercado-pago-charge-costs");
  expect(services.salesByDayScreen.fetchSalesReport).not.toHaveBeenCalled();
});

test("sends a person with only the reports area from the charge costs to the first view of its tab", async () => {
  const services = reportsServices(["reports_area"]);
  window.history.pushState(null, "", "/reports/mercado-pago-charge-costs");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect
    .element(screen.getByRole("heading", { name: "Margen por producto y por categoría", level: 1 }))
    .toBeVisible();
  expect(window.location.pathname).toBe("/reports/margin");
  expect(services.mercadoPagoChargeCostsScreen.fetchMercadoPagoChargeCosts).not.toHaveBeenCalled();
});

test("keeps the charge costs in the segmented control of Rentabilidad for who holds both permissions", async () => {
  const services = reportsServices(["reports_area", "mercado_pago_charge_costs"]);
  window.history.pushState(null, "", "/reports/margin");
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect
    .element(screen.getByRole("heading", { name: "Margen por producto y por categoría", level: 1 }))
    .toBeVisible();

  await userEvent.click(screen.getByRole("radio", { name: "Costos de Mercado Pago" }), {
    force: true,
  });

  await expect
    .element(screen.getByRole("heading", { name: "Costos de Mercado Pago", level: 1 }))
    .toBeVisible();
  expect(window.location.pathname).toBe("/reports/mercado-pago-charge-costs");
});

test("sends a person with neither permission away from the reports", async () => {
  const services = reportsServices(["branch_area"]);
  window.history.pushState(null, "", "/reports");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("tab", { name: "Passkeys y PIN" })).toBeVisible();
  expect(services.salesByDayScreen.fetchSalesReport).not.toHaveBeenCalled();
});

test("hides Reportes from a person with neither permission", async () => {
  const services = reportsServices(["branch_area"]);
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("navigation", { name: "Áreas" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Reportes", exact: true }).query()).toBeNull();
});
