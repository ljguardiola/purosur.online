import { FieldSizeProvider, formatSignedCents } from "@purosur/ui";
import { expectNoAccessibilityViolations, tokenRgb } from "@purosur/ui/test";
import { useState } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { periodSegments, typePeriodEnd, typePeriodStart } from "../shell/test-support/report-dates";
import {
  type MercadoPagoChargeCostsFilters,
  mercadoPagoChargeCostsFilters,
} from "./mercado-pago-charge-costs-filters";
import { MercadoPagoChargeCostsScreen } from "./mercado-pago-charge-costs-screen";
import type { MercadoPagoChargeCostsScreenServices } from "./mercado-pago-charge-costs-services";
import {
  emptyChargeCosts,
  weekChargeCosts,
} from "./test-support/mercado-pago-charge-costs-fixtures";

beforeEach(async () => {
  await page.viewport(1280, 900);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function createServices(): MercadoPagoChargeCostsScreenServices {
  const services = { fetchMercadoPagoChargeCosts: vi.fn() };
  services.fetchMercadoPagoChargeCosts.mockResolvedValue({ kind: "ok", value: weekChargeCosts });
  return services;
}

type Handlers = {
  filters?: MercadoPagoChargeCostsFilters;
  onFiltersChange?: (filters: MercadoPagoChargeCostsFilters) => void;
  onSessionEnded?: () => void;
};

function ControlledScreen({
  services,
  filters: initial = mercadoPagoChargeCostsFilters.parse({}),
  onFiltersChange = () => {},
  onSessionEnded = () => {},
}: Handlers & { services: MercadoPagoChargeCostsScreenServices }) {
  const [filters, setFilters] = useState(initial);
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <MercadoPagoChargeCostsScreen
          services={services}
          filters={filters}
          onFiltersChange={(next) => {
            onFiltersChange(next);
            setFilters(next);
          }}
          onSessionEnded={onSessionEnded}
        />
      </main>
    </FieldSizeProvider>
  );
}

function renderScreen(services: MercadoPagoChargeCostsScreenServices, handlers: Handlers = {}) {
  return render(<ControlledScreen services={services} {...handlers} />);
}

type Screen = Awaited<ReturnType<typeof renderScreen>>;

const TITLE = "Costos de Mercado Pago";

function chargesTable(screen: Screen) {
  return screen.getByRole("table", { name: "Cobros de Mercado Pago", exact: true });
}

function totalsTable(screen: Screen, name: string) {
  return screen.getByRole("table", { name, exact: true });
}

function emptyStateIconColor(title: Element): string {
  const icon = title.parentElement?.querySelector("svg");
  return icon ? getComputedStyle(icon).color : "";
}

test("titles the report under the charges reports", async () => {
  const screen = await renderScreen(createServices());

  await expect.element(screen.getByRole("heading", { name: TITLE, level: 1 })).toBeVisible();
  await expect.element(screen.getByText("Reportes · Cobros", { exact: true })).toBeVisible();
  await expectNoAccessibilityViolations(screen.container);
});

test("shows the period's gross, fee, financing, taxes, net and pending charges as the cloud answered them", async () => {
  const screen = await renderScreen(createServices());

  const cards = [
    ["Cobrado", formatSignedCents(120_000)],
    ["Comisión de Mercado Pago", formatSignedCents(-4_790)],
    ["Costo de financiación", formatSignedCents(-1_200)],
    ["Impuestos", formatSignedCents(-1_006)],
    ["Neto acreditado", formatSignedCents(113_004)],
    ["Cobros pendientes", "1"],
  ];
  for (const [label, value] of cards) {
    await expect.element(screen.getByText(`${label}${value}`, { exact: true })).toBeVisible();
  }
});

test("lists each charge with its figures and the moment it is released, in Argentine time", async () => {
  const screen = await renderScreen(createServices());

  const table = chargesTable(screen);
  for (const name of [
    "Fecha y hora",
    "Caja",
    "Medio de pago",
    "Monto cobrado",
    "Comisión",
    "Financiación",
    "Impuestos",
    "Neto",
    "Liberación",
  ]) {
    await expect.element(table.getByRole("columnheader", { name })).toBeVisible();
  }
  const charge = table.getByRole("row", { name: /^03\/10\/2026 · 14:30/ });
  for (const text of [
    "Caja 1",
    "QR",
    formatSignedCents(100_000),
    formatSignedCents(-3_990),
    formatSignedCents(-1_000),
    formatSignedCents(-838),
    formatSignedCents(94_172),
    "17/10/2026 · 12:00",
  ]) {
    await expect.element(charge.getByText(text, { exact: true })).toBeVisible();
  }
});

test("shows Pendiente instead of the figures of a charge no report has carried yet", async () => {
  const screen = await renderScreen(createServices());

  const charge = chargesTable(screen).getByRole("row", { name: /^04\/10\/2026 · 09:05/ });
  await expect.element(charge.getByText("Caja 2", { exact: true })).toBeVisible();
  await expect.element(charge.getByText("Point", { exact: true })).toBeVisible();
  await expect.element(charge.getByText("Pendiente", { exact: true }).first()).toBeVisible();
  expect(charge.getByText("Pendiente", { exact: true }).elements()).toHaveLength(6);
  expect(charge.element().textContent).not.toContain(formatSignedCents(50_000));
});

test("says which charges were not made from a sale of the system, and that every branch shows them", async () => {
  const screen = await renderScreen(createServices());

  await expect
    .element(
      screen.getByText(
        "Los otros cobros son cobros de Mercado Pago que no salieron de una venta del sistema; se muestran en el reporte de todas las sucursales.",
      ),
    )
    .toBeVisible();
});

test("totals the charges by day under a Día column, newest as the cloud answered them", async () => {
  const screen = await renderScreen(createServices());

  const table = totalsTable(screen, "Totales por día");
  await expect.element(table.getByRole("columnheader", { name: "Día" })).toBeVisible();
  for (const name of [
    "Cobros",
    "Pendientes",
    "Cobrado",
    "Comisión",
    "Financiación",
    "Impuestos",
    "Neto",
  ]) {
    await expect.element(table.getByRole("columnheader", { name })).toBeVisible();
  }
  const day = table.getByRole("row", { name: /^03\/10\/2026/ });
  await expect.element(day.getByText(formatSignedCents(120_000), { exact: true })).toBeVisible();
  await expect.element(day.getByText(formatSignedCents(-4_790), { exact: true })).toBeVisible();
  await expect.element(day.getByText(formatSignedCents(113_004), { exact: true })).toBeVisible();
  await expect.element(table.getByRole("row", { name: /^04\/10\/2026/ })).toBeVisible();
});

test("totals the charges by month, written as month and year", async () => {
  const screen = await renderScreen(createServices(), {
    filters: mercadoPagoChargeCostsFilters.parse({ group: "month" }),
  });

  const table = totalsTable(screen, "Totales por mes");
  await expect.element(table.getByRole("columnheader", { name: "Mes" })).toBeVisible();
  await expect.element(table.getByText("Octubre 2026", { exact: true })).toBeVisible();
});

test("totals the charges by payment method, naming the charges outside the system Otros cobros", async () => {
  const screen = await renderScreen(createServices(), {
    filters: mercadoPagoChargeCostsFilters.parse({ group: "method" }),
  });

  const table = totalsTable(screen, "Totales por medio de pago");
  await expect.element(table.getByRole("columnheader", { name: "Medio de pago" })).toBeVisible();
  await expect.element(table.getByRole("row", { name: /^QR/ })).toBeVisible();
  await expect.element(table.getByRole("row", { name: /^Point/ })).toBeVisible();
  const others = table.getByRole("row", { name: /^Otros cobros/ });
  await expect.element(others.getByText(formatSignedCents(20_000), { exact: true })).toBeVisible();
});

test("totals the charges by register, naming the ones tied to no register Otros cobros", async () => {
  const screen = await renderScreen(createServices(), {
    filters: mercadoPagoChargeCostsFilters.parse({ group: "register" }),
  });

  const table = totalsTable(screen, "Totales por caja");
  await expect.element(table.getByRole("columnheader", { name: "Caja" })).toBeVisible();
  await expect.element(table.getByRole("row", { name: /^Caja 1/ })).toBeVisible();
  await expect.element(table.getByRole("row", { name: /^Caja 2/ })).toBeVisible();
  const others = table.getByRole("row", { name: /^Otros cobros/ });
  await expect.element(others.getByText(formatSignedCents(18_832), { exact: true })).toBeVisible();
});

test("offers the groupings by day, month, payment method and register, and reports the one chosen", async () => {
  const onFiltersChange = vi.fn();
  const screen = await renderScreen(createServices(), { onFiltersChange });
  await expect.element(totalsTable(screen, "Totales por día")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: /Agrupar por:/ }));
  expect(
    screen
      .getByRole("option")
      .elements()
      .map((option) => option.textContent),
  ).toEqual(["Día", "Mes", "Medio de pago", "Caja"]);
  await userEvent.click(screen.getByRole("option", { name: "Caja" }));

  await expect.poll(() => onFiltersChange.mock.lastCall?.[0]).toMatchObject({ group: "register" });
  await expect.element(totalsTable(screen, "Totales por caja")).toBeVisible();
});

test("does not ask the cloud again when the grouping changes", async () => {
  const services = createServices();
  const screen = await renderScreen(services);
  await expect.element(totalsTable(screen, "Totales por día")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: /Agrupar por:/ }));
  await userEvent.click(screen.getByRole("option", { name: "Mes" }));

  await expect.element(totalsTable(screen, "Totales por mes")).toBeVisible();
  expect(services.fetchMercadoPagoChargeCosts).toHaveBeenCalledTimes(1);
});

test("asks the cloud for no period when the URL has none, and shows the range it answered", async () => {
  const services = createServices();

  const screen = await renderScreen(services);

  await expect.poll(() => periodSegments(screen).slice(0, 3)).toEqual(["1", "10", "2026"]);
  expect(periodSegments(screen).slice(3)).toEqual(["7", "10", "2026"]);
  expect(services.fetchMercadoPagoChargeCosts).toHaveBeenCalledWith({});
});

test("asks the cloud for the period the URL names", async () => {
  const services = createServices();

  await renderScreen(services, {
    filters: mercadoPagoChargeCostsFilters.parse({ from: "2026-10-02", to: "2026-10-05" }),
  });

  await expect
    .poll(() => vi.mocked(services.fetchMercadoPagoChargeCosts).mock.lastCall)
    .toEqual([{ from: "2026-10-02", to: "2026-10-05" }]);
});

test("asks the cloud again for the period typed in the filters", async () => {
  const services = createServices();
  const screen = await renderScreen(services);
  await expect.element(chargesTable(screen).getByText("Caja 1")).toBeVisible();

  await typePeriodStart(screen, "01102026");
  await typePeriodEnd(screen, "07102026");

  await expect
    .poll(() => vi.mocked(services.fetchMercadoPagoChargeCosts).mock.lastCall)
    .toEqual([{ from: "2026-10-01", to: "2026-10-07" }]);
});

test("keeps the previous report in view, marked as updating, while another period loads", async () => {
  const services = createServices();
  const screen = await renderScreen(services);
  await expect.element(chargesTable(screen).getByText("Caja 1")).toBeVisible();
  vi.mocked(services.fetchMercadoPagoChargeCosts).mockReturnValue(new Promise(() => {}));

  await typePeriodStart(screen, "01102026");
  await typePeriodEnd(screen, "07102026");

  await expect.element(chargesTable(screen)).toHaveAttribute("aria-busy", "true");
  await expect.element(chargesTable(screen).getByText("Caja 1")).toBeVisible();
});

test("shows placeholders while the report loads", async () => {
  const services = createServices();
  vi.mocked(services.fetchMercadoPagoChargeCosts).mockReturnValue(new Promise(() => {}));

  const screen = await renderScreen(services);

  await expect.element(chargesTable(screen)).toHaveAttribute("aria-busy", "true");
  await expect.element(screen.getByText("Neto acreditado", { exact: true })).toBeVisible();
  expect(screen.getByText(formatSignedCents(113_004)).query()).toBeNull();
});

test("says there are no charges in the period when there are none", async () => {
  const services = createServices();
  vi.mocked(services.fetchMercadoPagoChargeCosts).mockResolvedValue({
    kind: "ok",
    value: emptyChargeCosts,
  });

  const screen = await renderScreen(services);

  const empty = chargesTable(screen).getByText("No hay cobros de Mercado Pago en este período");
  await expect.element(empty).toBeVisible();
  await expect
    .element(screen.getByText(`Cobrado${formatSignedCents(0)}`, { exact: true }))
    .toBeVisible();
  expect(emptyStateIconColor(empty.element())).toBe(tokenRgb("text-accent"));
});

test("says there are no charges in the chosen period as a filtered result", async () => {
  const services = createServices();
  vi.mocked(services.fetchMercadoPagoChargeCosts).mockResolvedValue({
    kind: "ok",
    value: emptyChargeCosts,
  });

  const screen = await renderScreen(services, {
    filters: mercadoPagoChargeCostsFilters.parse({ from: "2026-10-02", to: "2026-10-05" }),
  });

  const empty = chargesTable(screen).getByText("No hay cobros de Mercado Pago en este período");
  await expect.element(empty).toBeVisible();
  expect(emptyStateIconColor(empty.element())).toBe(tokenRgb("text-subtle"));
});

test("shows a failed load with a retry that loads the report again, and no figures", async () => {
  const services = createServices();
  vi.mocked(services.fetchMercadoPagoChargeCosts)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockResolvedValueOnce({ kind: "ok", value: weekChargeCosts });
  const screen = await renderScreen(services);

  await expect.element(screen.getByRole("button", { name: "Reintentar" }).first()).toBeVisible();
  expect(screen.getByText("Neto acreditado", { exact: true }).query()).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }).first());

  await expect.element(chargesTable(screen).getByText("Caja 1")).toBeVisible();
  expect(services.fetchMercadoPagoChargeCosts).toHaveBeenCalledTimes(2);
});

test("ends the session when the cloud says it is over", async () => {
  const services = createServices();
  vi.mocked(services.fetchMercadoPagoChargeCosts).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();

  await renderScreen(services, { onSessionEnded });

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("sends the person to Mi cuenta when the cloud refuses the report", async () => {
  const services = createServices();
  vi.mocked(services.fetchMercadoPagoChargeCosts).mockResolvedValue({ kind: "forbidden" });

  await renderScreen(services);

  await expect
    .poll(() => window.location.pathname + window.location.search)
    .toBe("/?account=credentials");
});
