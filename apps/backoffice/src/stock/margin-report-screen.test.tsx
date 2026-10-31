import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { useState } from "react";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { dateSegments } from "../shell/test-support/report-dates";
import { FRONT_REGISTER_ID } from "../shell/test-support/report-fixtures";
import {
  createReportRegisterFilterServices,
  type ReportRegisterFilterServices,
  reportRegisterFieldForTests,
} from "../shell/test-support/report-register-filter";
import { type MarginReportFilters, marginReportFilters } from "./margin-report-filters";
import { MarginReportScreen } from "./margin-report-screen";
import type { MarginReportScreenServices } from "./margin-report-services";
import {
  categoryMarginReport,
  completeMarginReport,
  manyMarginRowsReport,
  noMarginReport,
  productMarginReport,
} from "./test-support/margin-report-fixtures";

function createServices(): MarginReportScreenServices {
  const services = { fetchMarginReport: vi.fn() };
  services.fetchMarginReport.mockResolvedValue({ kind: "ok", value: categoryMarginReport });
  return services;
}

type Handlers = {
  filters?: MarginReportFilters;
  onFiltersChange?: (filters: MarginReportFilters) => void;
  onSessionEnded?: () => void;
};

function ControlledScreen({
  services,
  filters: initial = marginReportFilters.parse({}),
  onFiltersChange = () => {},
  onSessionEnded = () => {},
  registerServices,
}: Handlers & {
  services: MarginReportScreenServices;
  registerServices: ReportRegisterFilterServices;
}) {
  const [filters, setFilters] = useState(initial);
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <MarginReportScreen
          services={services}
          filters={filters}
          onFiltersChange={(next) => {
            onFiltersChange(next);
            setFilters(next);
          }}
          onSessionEnded={onSessionEnded}
          registerFilter={reportRegisterFieldForTests(registerServices, onSessionEnded)}
        />
      </main>
    </FieldSizeProvider>
  );
}

function renderScreen(
  services: MarginReportScreenServices,
  {
    registerServices = createReportRegisterFilterServices(),
    ...handlers
  }: Handlers & { registerServices?: ReportRegisterFilterServices } = {},
) {
  return render(
    <ControlledScreen services={services} registerServices={registerServices} {...handlers} />,
  );
}

type Screen = Awaited<ReturnType<typeof renderScreen>>;

const CATEGORY_NAMES = ["Almacén › Dulces", "Fiambres", "Bebidas", "Sin categoría"];

function shownCategories(screen: Screen) {
  return screen
    .getByRole("row")
    .elements()
    .map((row) => CATEGORY_NAMES.find((name) => row.textContent?.includes(name)))
    .filter((name) => name !== undefined);
}

test("names the report and shows the amount sold, the cost and the margin of the period", async () => {
  const screen = await renderScreen(createServices());

  await expect
    .element(screen.getByRole("heading", { name: "Margen por producto y por categoría", level: 1 }))
    .toBeVisible();
  await expect.element(screen.getByText("Reportes · Rentabilidad", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("Vendido", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("$ 10.000,00")).toBeVisible();
  await expect.element(screen.getByText("Costo", { exact: true }).first()).toBeVisible();
  await expect.element(screen.getByText("$ 6.700,00")).toBeVisible();
  await expect.element(screen.getByText("Margen", { exact: true }).first()).toBeVisible();
  await expect.element(screen.getByText("$ 3.300,00")).toBeVisible();
  await expectNoAccessibilityViolations(screen.container);
});

test("shows each category by its path with its amount sold, its cost and its margin", async () => {
  const screen = await renderScreen(createServices());

  const table = screen.getByRole("table", { name: "Margen por producto y por categoría" });
  await expect.element(table.getByRole("columnheader", { name: "Categoría" })).toBeVisible();
  await expect.element(table.getByRole("columnheader", { name: "Vendido" })).toBeVisible();
  await expect.element(table.getByRole("columnheader", { name: "Costo" })).toBeVisible();
  await expect.element(table.getByRole("columnheader", { name: "Margen" })).toBeVisible();
  const sweets = table.getByRole("row", { name: /Almacén › Dulces/ });
  await expect.element(sweets.getByText("$ 4.100,00")).toBeVisible();
  await expect.element(sweets.getByText("$ 2.500,00")).toBeVisible();
  await expect.element(sweets.getByText("$ 1.600,00")).toBeVisible();
  await expect.element(table.getByRole("row", { name: /Sin categoría/ })).toBeVisible();
});

test("shows a negative margin as the cloud answered it", async () => {
  const screen = await renderScreen(createServices());

  const row = screen.getByRole("table").getByRole("row", { name: /Bebidas/ });
  await expect.element(row.getByText(/100,00/).last()).toBeVisible();
  expect(row.element().textContent).toMatch(/-\s?\$\s?100,00|\$\s?-100,00/);
});

test("warns how many sales have an incomplete cost and that their margin counts the known cost only", async () => {
  const screen = await renderScreen(createServices());

  await expect.element(screen.getByText("2 ventas tienen el costo incompleto")).toBeVisible();
  await expect
    .element(screen.getByText(/margen incluye esas ventas con el costo conocido solamente/))
    .toBeVisible();
});

test("says 1 venta in the singular when only one sale has an incomplete cost", async () => {
  const services = createServices();
  vi.mocked(services.fetchMarginReport).mockResolvedValue({
    kind: "ok",
    value: productMarginReport,
  });

  const screen = await renderScreen(services, {
    filters: marginReportFilters.parse({ group: "product" }),
  });

  await expect.element(screen.getByText("1 venta tiene el costo incompleto")).toBeVisible();
});

test("flags only the rows with sales of incomplete cost", async () => {
  const screen = await renderScreen(createServices());

  const table = screen.getByRole("table");
  await expect
    .element(
      table.getByRole("row", { name: /Fiambres/ }).getByText("Costo incompleto · 2 ventas"),
    )
    .toBeVisible();
  expect(screen.getByText(/Costo incompleto/).elements()).toHaveLength(1);
});

test("shows no warning when every sale has its cost", async () => {
  const services = createServices();
  vi.mocked(services.fetchMarginReport).mockResolvedValue({
    kind: "ok",
    value: completeMarginReport,
  });

  const screen = await renderScreen(services);
  await expect.element(screen.getByText("$ 3.300,00")).toBeVisible();

  expect(screen.getByText(/costo incompleto/i).query()).toBeNull();
});

test("opens on the category with the biggest amount first", async () => {
  const screen = await renderScreen(createServices());
  await expect.element(screen.getByText("Fiambres").first()).toBeVisible();

  expect(shownCategories(screen)).toEqual([
    "Almacén › Dulces",
    "Fiambres",
    "Bebidas",
    "Sin categoría",
  ]);
});

test.each([
  [
    { sortBy: "name", sort: "ascending" },
    ["Almacén › Dulces", "Bebidas", "Fiambres", "Sin categoría"],
  ],
  [
    { sortBy: "margin", sort: "descending" },
    ["Almacén › Dulces", "Fiambres", "Sin categoría", "Bebidas"],
  ],
] as const)("opens on the order the URL asks for, %j", async (order, categories) => {
  const screen = await renderScreen(createServices(), {
    filters: marginReportFilters.parse(order),
  });
  await expect.element(screen.getByText("Fiambres").first()).toBeVisible();

  expect(shownCategories(screen)).toEqual(categories);
});

test.each([
  ["Categoría", { sortBy: "name", sort: "ascending" }],
  ["Vendido", { sortBy: "amount", sort: "ascending" }],
  ["Margen", { sortBy: "margin", sort: "descending" }],
] as const)(
  "reports the %s column as the order when its header is pressed",
  async (header, order) => {
    const onFiltersChange = vi.fn();
    const screen = await renderScreen(createServices(), { onFiltersChange });
    await expect.element(screen.getByText("Fiambres").first()).toBeVisible();

    await userEvent.click(
      screen.getByRole("table").getByRole("button", { name: header, exact: true }),
    );

    await expect.poll(() => onFiltersChange.mock.lastCall?.[0]).toMatchObject(order);
  },
);

test("asks the cloud by category, with no range, when the URL has none, and shows the range it answered", async () => {
  const services = createServices();

  const screen = await renderScreen(services);

  await expect.poll(() => dateSegments(screen, "Desde")).toEqual(["1", "10", "2026"]);
  expect(dateSegments(screen, "Hasta")).toEqual(["7", "10", "2026"]);
  expect(services.fetchMarginReport).toHaveBeenCalledWith({ group: "category" });
});

test("asks the cloud for the grouping, the range and the register the URL names", async () => {
  const services = createServices();

  await renderScreen(services, {
    filters: marginReportFilters.parse({
      from: "2026-10-02",
      to: "2026-10-05",
      register: FRONT_REGISTER_ID,
      group: "product",
    }),
  });

  await expect
    .poll(() => vi.mocked(services.fetchMarginReport).mock.lastCall)
    .toEqual([
      { group: "product", from: "2026-10-02", to: "2026-10-05", register_id: FRONT_REGISTER_ID },
    ]);
});

test("asks the cloud again for the register chosen in the filters", async () => {
  const services = createServices();
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Fiambres").first()).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: /Caja:/ }));
  await userEvent.click(screen.getByRole("option", { name: "Caja principal" }));

  await expect
    .poll(() => vi.mocked(services.fetchMarginReport).mock.lastCall)
    .toEqual([{ group: "category", register_id: FRONT_REGISTER_ID }]);
});

test("groups by product when the Agrupar filter is changed, and reports it", async () => {
  const services = createServices();
  const onFiltersChange = vi.fn();
  const screen = await renderScreen(services, { onFiltersChange });
  await expect.element(screen.getByText("Fiambres").first()).toBeVisible();
  vi.mocked(services.fetchMarginReport).mockResolvedValue({
    kind: "ok",
    value: productMarginReport,
  });

  await userEvent.click(screen.getByRole("button", { name: /Agrupar:/ }));
  await userEvent.click(screen.getByRole("option", { name: "Por producto" }));

  await expect.poll(() => onFiltersChange.mock.lastCall?.[0]).toMatchObject({ group: "product" });
  await expect
    .poll(() => vi.mocked(services.fetchMarginReport).mock.lastCall)
    .toEqual([{ group: "product" }]);
  const table = screen.getByRole("table", { name: "Margen por producto y por categoría" });
  await expect.element(table.getByRole("columnheader", { name: "Producto" })).toBeVisible();
  await expect.element(table.getByRole("row", { name: /Queso cremoso/ })).toBeVisible();
});

test("offers the groupings Por categoría and Por producto", async () => {
  const screen = await renderScreen(createServices());

  await userEvent.click(screen.getByRole("button", { name: /Agrupar:/ }));

  await expect.element(screen.getByRole("option", { name: "Por categoría" })).toBeVisible();
  await expect.element(screen.getByRole("option", { name: "Por producto" })).toBeVisible();
});

test("names each product with its brand and net content when grouped by product", async () => {
  const services = createServices();
  vi.mocked(services.fetchMarginReport).mockResolvedValue({
    kind: "ok",
    value: productMarginReport,
  });

  const screen = await renderScreen(services, {
    filters: marginReportFilters.parse({ group: "product" }),
  });

  const table = screen.getByRole("table", { name: "Margen por producto y por categoría" });
  await expect.element(table.getByRole("columnheader", { name: "Producto" })).toBeVisible();
  const yerba = table.getByRole("row", { name: /Yerba mate Hoja Alta 1 kg/ });
  await expect.element(yerba.getByText("$ 900,00")).toBeVisible();
  await expect.element(yerba.getByText("Costo incompleto · 1 venta")).toBeVisible();
});

test("keeps the previous rows, marked as updating, while another grouping loads", async () => {
  const services = createServices();
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Fiambres").first()).toBeVisible();
  vi.mocked(services.fetchMarginReport).mockReturnValue(new Promise(() => {}));

  await userEvent.click(screen.getByRole("button", { name: /Agrupar:/ }));
  await userEvent.click(screen.getByRole("option", { name: "Por producto" }));

  await expect
    .element(screen.getByRole("table", { name: "Margen por producto y por categoría" }))
    .toHaveAttribute("aria-busy", "true");
  await expect.element(screen.getByText("Fiambres").first()).toBeVisible();
});

test("shows placeholders while the report loads", async () => {
  const services = createServices();
  vi.mocked(services.fetchMarginReport).mockReturnValue(new Promise(() => {}));

  const screen = await renderScreen(services);

  await expect
    .element(screen.getByRole("table", { name: "Margen por producto y por categoría" }))
    .toHaveAttribute("aria-busy", "true");
  await expect.element(screen.getByText("Vendido", { exact: true })).toBeVisible();
  expect(screen.getByText("$ 10.000,00").query()).toBeNull();
  expect(screen.getByText(/costo incompleto/i).query()).toBeNull();
});

test("says there are no sales in the period when there are none", async () => {
  const services = createServices();
  vi.mocked(services.fetchMarginReport).mockResolvedValue({ kind: "ok", value: noMarginReport });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("No hay ventas en este período")).toBeVisible();
  await expect.element(screen.getByText("$ 0,00").first()).toBeVisible();
});

test("says the register has no sales in the period when one is chosen and none were made", async () => {
  const services = createServices();
  vi.mocked(services.fetchMarginReport).mockResolvedValue({ kind: "ok", value: noMarginReport });

  const screen = await renderScreen(services, {
    filters: marginReportFilters.parse({ register: FRONT_REGISTER_ID }),
  });

  await expect
    .element(screen.getByText("No hay ventas de esta caja en este período"))
    .toBeVisible();
});

test("shows a failed load with a retry that loads the report again", async () => {
  const services = createServices();
  vi.mocked(services.fetchMarginReport)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockResolvedValueOnce({ kind: "ok", value: categoryMarginReport });
  const screen = await renderScreen(services);

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByText("Fiambres").first()).toBeVisible();
  expect(services.fetchMarginReport).toHaveBeenCalledTimes(2);
});

test("ends the session when the cloud says it is over", async () => {
  const services = createServices();
  vi.mocked(services.fetchMarginReport).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();

  await renderScreen(services, { onSessionEnded });

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("navigates to Mi cuenta when the report request comes back forbidden", async () => {
  const services = createServices();
  vi.mocked(services.fetchMarginReport).mockResolvedValue({ kind: "forbidden" });

  await renderScreen(services);

  await expect.poll(() => window.location.pathname).toBe("/account");
});

test("pages a report with more rows than a page and counts them", async () => {
  const services = createServices();
  vi.mocked(services.fetchMarginReport).mockResolvedValue({
    kind: "ok",
    value: manyMarginRowsReport(30),
  });
  const screen = await renderScreen(services, {
    filters: marginReportFilters.parse({ group: "product", sortBy: "name", sort: "ascending" }),
  });
  await expect.element(screen.getByRole("table").getByText("Producto 01")).toBeVisible();

  expect(screen.getByRole("row").elements()).toHaveLength(26);
  await expect.element(screen.getByText("30 productos")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Página 2" }));

  await expect.element(screen.getByRole("table").getByText("Producto 26")).toBeVisible();
  expect(screen.getByRole("table").getByText("Producto 01").query()).toBeNull();
});

test("counts the categories, and does not offer pages for a report that fits in one", async () => {
  const screen = await renderScreen(createServices());
  await expect.element(screen.getByText("Fiambres").first()).toBeVisible();

  expect(screen.getByRole("navigation", { name: /Páginas/ }).query()).toBeNull();
  await expect.element(screen.getByText("4 categorías")).toBeVisible();
});

test("goes back to the first page when the grouping changes", async () => {
  const services = createServices();
  vi.mocked(services.fetchMarginReport).mockResolvedValue({
    kind: "ok",
    value: manyMarginRowsReport(30),
  });
  const screen = await renderScreen(services, {
    filters: marginReportFilters.parse({ group: "product", sortBy: "name", sort: "ascending" }),
  });
  await expect.element(screen.getByRole("table").getByText("Producto 01")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Página 2" }));
  await expect.element(screen.getByRole("table").getByText("Producto 26")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: /Agrupar:/ }));
  await userEvent.click(screen.getByRole("option", { name: "Por categoría" }));

  await expect.element(screen.getByRole("table").getByText("Producto 01")).toBeVisible();
});
