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
import {
  type SalesByProductAndCategoryFilters,
  salesByProductAndCategoryFilters,
} from "./sales-by-product-and-category-filters";
import { SalesByProductAndCategoryScreen } from "./sales-by-product-and-category-screen";
import type { SalesByProductAndCategoryScreenServices } from "./sales-by-product-and-category-services";
import {
  categoryProductsReport,
  manyProductsReport,
  noProductsReport,
  productProductsReport,
} from "./test-support/sales-fixtures";

function createServices(): SalesByProductAndCategoryScreenServices {
  const services = { fetchSalesByProductAndCategory: vi.fn() };
  services.fetchSalesByProductAndCategory.mockResolvedValue({
    kind: "ok",
    value: categoryProductsReport,
  });
  return services;
}

type Handlers = {
  filters?: SalesByProductAndCategoryFilters;
  onFiltersChange?: (filters: SalesByProductAndCategoryFilters) => void;
  onSessionEnded?: () => void;
};

function ControlledScreen({
  services,
  filters: initial = salesByProductAndCategoryFilters.parse({}),
  onFiltersChange = () => {},
  onSessionEnded = () => {},
  registerServices,
}: Handlers & {
  services: SalesByProductAndCategoryScreenServices;
  registerServices: ReportRegisterFilterServices;
}) {
  const [filters, setFilters] = useState(initial);
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <SalesByProductAndCategoryScreen
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
  services: SalesByProductAndCategoryScreenServices,
  {
    registerServices = createReportRegisterFilterServices(),
    ...handlers
  }: Handlers & {
    registerServices?: ReportRegisterFilterServices;
  } = {},
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

test("names the report, the grouping and the figures of the period", async () => {
  const screen = await renderScreen(createServices());

  await expect
    .element(screen.getByRole("heading", { name: "Ventas por producto y por categoría", level: 1 }))
    .toBeVisible();
  await expect.element(screen.getByText("Reportes · Ventas", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("Total vendido")).toBeVisible();
  await expect.element(screen.getByText("$ 10.000,00")).toBeVisible();
  await expect.element(screen.getByText("Cantidad", { exact: true }).first()).toBeVisible();
  await expect.element(screen.getByText("1.842 u · 186,400 kg")).toBeVisible();
  await expect.element(screen.getByText("Categoría principal")).toBeVisible();
  await expect.element(screen.getByText("Almacén › Dulces").first()).toBeVisible();
  await expect.element(screen.getByText("41 % del importe")).toBeVisible();
  await expectNoAccessibilityViolations(screen.container);
});

test("names the period only in its range fields, never again under the total sold", async () => {
  const screen = await renderScreen(createServices());
  await expect.element(screen.getByText("$ 10.000,00")).toBeVisible();

  expect(screen.getByText(/01\/10\/2026/).query()).toBeNull();
  expect(screen.getByText(/07\/10\/2026/).query()).toBeNull();
});

test("shows each category by its path with its quantity sold, its amount and its share of the total", async () => {
  const screen = await renderScreen(createServices());

  const table = screen.getByRole("table", { name: "Ventas por producto y por categoría" });
  await expect.element(table.getByRole("columnheader", { name: "Categoría" })).toBeVisible();
  await expect.element(table.getByRole("columnheader", { name: "Cantidad" })).toBeVisible();
  await expect.element(table.getByRole("columnheader", { name: "Importe" })).toBeVisible();
  await expect.element(table.getByRole("columnheader", { name: "Parte del total" })).toBeVisible();
  const sweets = table.getByRole("row", { name: /Almacén › Dulces/ });
  await expect.element(sweets.getByText("1.200 u")).toBeVisible();
  await expect.element(sweets.getByText("$ 4.100,00")).toBeVisible();
  await expect.element(sweets.getByText("41 %")).toBeVisible();
  const cold = table.getByRole("row", { name: /Fiambres/ });
  await expect.element(cold.getByText("42 u · 186,400 kg")).toBeVisible();
  await expect.element(table.getByRole("row", { name: /Bebidas/ })).toBeVisible();
});

test("shows the sales of products without a category in one row called Sin categoría", async () => {
  const screen = await renderScreen(createServices());

  const row = screen.getByRole("table").getByRole("row", { name: /Sin categoría/ });
  await expect.element(row.getByText("3 u")).toBeVisible();
  await expect.element(row.getByText("$ 1.000,00")).toBeVisible();
});

test("opens on the category with the biggest amount first", async () => {
  const screen = await renderScreen(createServices());
  await expect.element(screen.getByText("Fiambres")).toBeVisible();

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
    { sortBy: "amount", sort: "ascending" },
    ["Sin categoría", "Bebidas", "Fiambres", "Almacén › Dulces"],
  ],
] as const)("opens on the order the URL asks for, %j", async (order, categories) => {
  const screen = await renderScreen(createServices(), {
    filters: salesByProductAndCategoryFilters.parse(order),
  });
  await expect.element(screen.getByText("Fiambres")).toBeVisible();

  expect(shownCategories(screen)).toEqual(categories);
});

test.each([
  ["Categoría", { sortBy: "name", sort: "ascending" }],
  ["Importe", { sortBy: "amount", sort: "ascending" }],
] as const)(
  "reports the %s column as the order when its header is pressed",
  async (header, order) => {
    const onFiltersChange = vi.fn();
    const screen = await renderScreen(createServices(), { onFiltersChange });
    await expect.element(screen.getByText("Fiambres")).toBeVisible();

    await userEvent.click(
      screen.getByRole("table").getByRole("button", { name: header, exact: true }),
    );

    await expect.poll(() => onFiltersChange.mock.lastCall?.[0]).toMatchObject(order);
  },
);

test("does not offer to order by the quantity column", async () => {
  const screen = await renderScreen(createServices());
  await expect.element(screen.getByText("Fiambres")).toBeVisible();

  expect(
    screen.getByRole("table").getByRole("button", { name: "Cantidad", exact: true }).query(),
  ).toBeNull();
});

test("asks the cloud by category, with no range, when the URL has none, and shows the range it answered", async () => {
  const services = createServices();

  const screen = await renderScreen(services);

  await expect.poll(() => dateSegments(screen, "Desde")).toEqual(["1", "10", "2026"]);
  expect(dateSegments(screen, "Hasta")).toEqual(["7", "10", "2026"]);
  expect(services.fetchSalesByProductAndCategory).toHaveBeenCalledWith({ group: "category" });
});

test("asks the cloud for the grouping, the range and the register the URL names", async () => {
  const services = createServices();

  await renderScreen(services, {
    filters: salesByProductAndCategoryFilters.parse({
      from: "2026-10-02",
      to: "2026-10-05",
      register: FRONT_REGISTER_ID,
      group: "product",
    }),
  });

  await expect
    .poll(() => vi.mocked(services.fetchSalesByProductAndCategory).mock.lastCall)
    .toEqual([
      { group: "product", from: "2026-10-02", to: "2026-10-05", register_id: FRONT_REGISTER_ID },
    ]);
});

test("asks the cloud again for the register chosen in the filters", async () => {
  const services = createServices();
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Fiambres")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: /Caja:/ }));
  await userEvent.click(screen.getByRole("option", { name: "Caja principal" }));

  await expect
    .poll(() => vi.mocked(services.fetchSalesByProductAndCategory).mock.lastCall)
    .toEqual([{ group: "category", register_id: FRONT_REGISTER_ID }]);
});

test("groups by product when the Agrupar filter is changed, and reports it", async () => {
  const services = createServices();
  const onFiltersChange = vi.fn();
  const screen = await renderScreen(services, { onFiltersChange });
  await expect.element(screen.getByText("Fiambres")).toBeVisible();
  vi.mocked(services.fetchSalesByProductAndCategory).mockResolvedValue({
    kind: "ok",
    value: productProductsReport,
  });

  await userEvent.click(screen.getByRole("button", { name: /Agrupar:/ }));
  await userEvent.click(screen.getByRole("option", { name: "Por producto" }));

  await expect.poll(() => onFiltersChange.mock.lastCall?.[0]).toMatchObject({ group: "product" });
  await expect
    .poll(() => vi.mocked(services.fetchSalesByProductAndCategory).mock.lastCall)
    .toEqual([{ group: "product" }]);
  const table = screen.getByRole("table", { name: "Ventas por producto y por categoría" });
  await expect.element(table.getByRole("columnheader", { name: "Producto" })).toBeVisible();
  await expect.element(table.getByRole("row", { name: /Queso cremoso/ })).toBeVisible();
});

test("offers the groupings Por categoría and Por producto", async () => {
  const screen = await renderScreen(createServices());

  await userEvent.click(screen.getByRole("button", { name: /Agrupar:/ }));

  await expect.element(screen.getByRole("option", { name: "Por categoría" })).toBeVisible();
  await expect.element(screen.getByRole("option", { name: "Por producto" })).toBeVisible();
});

test("shows the products, their weighed units and the main product when grouped by product", async () => {
  const services = createServices();
  vi.mocked(services.fetchSalesByProductAndCategory).mockResolvedValue({
    kind: "ok",
    value: productProductsReport,
  });

  const screen = await renderScreen(services, {
    filters: salesByProductAndCategoryFilters.parse({ group: "product" }),
  });

  const table = screen.getByRole("table", { name: "Ventas por producto y por categoría" });
  await expect.element(table.getByRole("columnheader", { name: "Producto" })).toBeVisible();
  await expect.element(table.getByRole("row", { name: /Queso cremoso/ })).toBeVisible();
  await expect
    .element(table.getByRole("row", { name: /Queso cremoso/ }).getByText("12,500 kg"))
    .toBeVisible();
  await expect
    .element(table.getByRole("row", { name: /Yerba mate 1 kg/ }).getByText("80 u"))
    .toBeVisible();
  await expect.element(screen.getByText("Producto principal")).toBeVisible();
  await expect.element(screen.getByText("60 % del importe")).toBeVisible();
  await expect.element(screen.getByText("12,500 kg").first()).toBeVisible();
});

test("keeps the previous rows and labels, marked as updating, while another grouping loads", async () => {
  const services = createServices();
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Fiambres")).toBeVisible();
  vi.mocked(services.fetchSalesByProductAndCategory).mockReturnValue(new Promise(() => {}));

  await userEvent.click(screen.getByRole("button", { name: /Agrupar:/ }));
  await userEvent.click(screen.getByRole("option", { name: "Por producto" }));

  await expect
    .element(screen.getByRole("table", { name: "Ventas por producto y por categoría" }))
    .toHaveAttribute("aria-busy", "true");
  await expect.element(screen.getByText("Fiambres")).toBeVisible();
  await expect.element(screen.getByText("Categoría principal")).toBeVisible();
});

test("shows placeholders while the report loads", async () => {
  const services = createServices();
  vi.mocked(services.fetchSalesByProductAndCategory).mockReturnValue(new Promise(() => {}));

  const screen = await renderScreen(services);

  await expect
    .element(screen.getByRole("table", { name: "Ventas por producto y por categoría" }))
    .toHaveAttribute("aria-busy", "true");
  await expect.element(screen.getByText("Total vendido")).toBeVisible();
  await expect.element(screen.getByText("Categoría principal")).toBeVisible();
  expect(screen.getByText("$ 10.000,00").query()).toBeNull();
});

test("says there are no sales in the period, with zero units and no main category, when there are none", async () => {
  const services = createServices();
  vi.mocked(services.fetchSalesByProductAndCategory).mockResolvedValue({
    kind: "ok",
    value: noProductsReport,
  });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("No hay ventas en este período")).toBeVisible();
  await expect.element(screen.getByText("$ 0,00")).toBeVisible();
  await expect.element(screen.getByText("0 u", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("—", { exact: true })).toBeVisible();
});

test("says the register has no sales in the period when one is chosen and none were made", async () => {
  const services = createServices();
  vi.mocked(services.fetchSalesByProductAndCategory).mockResolvedValue({
    kind: "ok",
    value: noProductsReport,
  });

  const screen = await renderScreen(services, {
    filters: salesByProductAndCategoryFilters.parse({ register: FRONT_REGISTER_ID }),
  });

  await expect
    .element(screen.getByText("No hay ventas de esta caja en este período"))
    .toBeVisible();
});

test("shows a failed load with a retry that loads the report again", async () => {
  const services = createServices();
  vi.mocked(services.fetchSalesByProductAndCategory)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockResolvedValueOnce({ kind: "ok", value: categoryProductsReport });
  const screen = await renderScreen(services);

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByText("Fiambres")).toBeVisible();
  expect(services.fetchSalesByProductAndCategory).toHaveBeenCalledTimes(2);
});

test("ends the session when the cloud says it is over", async () => {
  const services = createServices();
  vi.mocked(services.fetchSalesByProductAndCategory).mockResolvedValue({
    kind: "unauthenticated",
  });
  const onSessionEnded = vi.fn();

  await renderScreen(services, { onSessionEnded });

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("navigates to Mi cuenta when the report request comes back forbidden", async () => {
  const services = createServices();
  vi.mocked(services.fetchSalesByProductAndCategory).mockResolvedValue({ kind: "forbidden" });

  await renderScreen(services);

  await expect.poll(() => window.location.pathname).toBe("/account");
});

test("pages a report with more rows than a page and counts them", async () => {
  const services = createServices();
  vi.mocked(services.fetchSalesByProductAndCategory).mockResolvedValue({
    kind: "ok",
    value: manyProductsReport(30),
  });
  const screen = await renderScreen(services, {
    filters: salesByProductAndCategoryFilters.parse({
      group: "product",
      sortBy: "name",
      sort: "ascending",
    }),
  });
  await expect.element(screen.getByRole("table").getByText("Producto 01")).toBeVisible();

  expect(screen.getByRole("row").elements()).toHaveLength(26);
  await expect.element(screen.getByText("30 productos")).toBeVisible();
  expect(screen.getByRole("table").getByText("Producto 26").query()).toBeNull();

  await userEvent.click(screen.getByRole("button", { name: "Página 2" }));

  await expect.element(screen.getByRole("table").getByText("Producto 26")).toBeVisible();
  expect(screen.getByRole("row").elements()).toHaveLength(6);
  expect(screen.getByRole("table").getByText("Producto 01").query()).toBeNull();
});

test("does not offer pages for a report that fits in one", async () => {
  const screen = await renderScreen(createServices());
  await expect.element(screen.getByText("Fiambres")).toBeVisible();

  expect(screen.getByRole("navigation", { name: /Páginas/ }).query()).toBeNull();
  await expect.element(screen.getByText("4 categorías")).toBeVisible();
});

test("goes back to the first page when the grouping changes", async () => {
  const services = createServices();
  vi.mocked(services.fetchSalesByProductAndCategory).mockResolvedValue({
    kind: "ok",
    value: manyProductsReport(30),
  });
  const screen = await renderScreen(services, {
    filters: salesByProductAndCategoryFilters.parse({
      group: "product",
      sortBy: "name",
      sort: "ascending",
    }),
  });
  await expect.element(screen.getByRole("table").getByText("Producto 01")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Página 2" }));
  await expect.element(screen.getByRole("table").getByText("Producto 26")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: /Agrupar:/ }));
  await userEvent.click(screen.getByRole("option", { name: "Por categoría" }));

  await expect.element(screen.getByRole("table").getByText("Producto 01")).toBeVisible();
});
