import { beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { readDownloadedXlsx } from "../platform/spreadsheet/test-support/read-xlsx";
import {
  erasePeriodEnd,
  periodSegments,
  typePeriodStart,
} from "../shell/test-support/report-dates";
import { spyOnDownloads } from "../shell/test-support/spy-on-downloads";
import {
  createServices,
  renderControlledScreen,
  renderScreen,
  rice,
} from "./test-support/prices-list-screen";

beforeEach(async () => {
  await page.viewport(1280, 900);
});

const REPORT_TABLE = { name: "Precios sin revisar" } as const;
const PRICES_TABLE = { name: "Precios", exact: true } as const;
const PERIOD = { from: "2026-10-02", to: "2026-10-05" };

function servicesWithOneProduct() {
  const services = createServices();
  vi.mocked(services.fetchPrices).mockResolvedValue({
    kind: "ok",
    value: {
      products: [rice],
      pendingCount: 1,
      activeProductCount: 3,
      reviewWindowDays: 30,
      categories: [],
    },
  });
  return services;
}

test("under Por revisar with no period lists the prices with their actions, beside the period", async () => {
  const services = servicesWithOneProduct();
  const screen = await renderScreen(services, () => {}, { filters: { review: "pending" } });

  await expect.element(screen.getByRole("table", PRICES_TABLE).getByText("Arroz")).toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: "Cambiar el precio de Arroz" }))
    .toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Revisar 1" })).toBeVisible();
  await expect.poll(() => periodSegments(screen).slice(0, 3)).toEqual(["31", "8", "2026"]);
  await expect.element(screen.getByRole("button", { name: "Descargar planilla" })).toBeVisible();
  expect(screen.getByRole("table", REPORT_TABLE).query()).toBeNull();
  expect(services.fetchPricesPastReviewDeadlineReport).toHaveBeenCalledWith({});
});

test("under Por revisar with a period lists the report's rows instead of the prices table", async () => {
  const services = servicesWithOneProduct();
  const screen = await renderScreen(services, () => {}, {
    filters: { review: "pending", ...PERIOD },
  });

  await expect.element(screen.getByRole("table", REPORT_TABLE)).toBeVisible();
  await expect.element(screen.getByText("Queso cremoso")).toBeVisible();
  await expect.element(screen.getByText("2 precios", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("Plazo de revisión: 30 días")).toBeVisible();
  expect(screen.getByRole("table", PRICES_TABLE).query()).toBeNull();
  await expect
    .poll(() => vi.mocked(services.fetchPricesPastReviewDeadlineReport).mock.lastCall)
    .toEqual([PERIOD]);
});

test("keeps the review action beside the report rows", async () => {
  const screen = await renderScreen(servicesWithOneProduct(), () => {}, {
    filters: { review: "pending", ...PERIOD },
  });

  await expect.element(screen.getByRole("button", { name: "Revisar 1" })).toBeVisible();
});

test("typing a period reports it with no search or category, asks the report again and swaps the prices for its rows", async () => {
  const services = servicesWithOneProduct();
  const onFiltersChange = vi.fn();
  const screen = await renderControlledScreen(services, { review: "pending" }, onFiltersChange);
  await expect.element(screen.getByRole("table", PRICES_TABLE).getByText("Arroz")).toBeVisible();
  await expect.poll(() => periodSegments(screen).slice(0, 3)).toEqual(["31", "8", "2026"]);

  await typePeriodStart(screen, "01092026");

  await expect
    .poll(() => vi.mocked(services.fetchPricesPastReviewDeadlineReport).mock.lastCall)
    .toEqual([{ from: "2026-09-01", to: "2026-10-13" }]);
  expect(onFiltersChange).toHaveBeenLastCalledWith({
    search: "",
    category: "ALL",
    review: "pending",
    from: "2026-09-01",
    to: "2026-10-13",
  });
  await expect.element(screen.getByRole("table", REPORT_TABLE)).toBeVisible();
  expect(screen.getByRole("table", PRICES_TABLE).query()).toBeNull();
});

test("hides the search and the category filter while the report's rows are listed", async () => {
  const screen = await renderScreen(servicesWithOneProduct(), () => {}, {
    filters: { review: "pending", ...PERIOD },
  });
  await expect.element(screen.getByRole("table", REPORT_TABLE)).toBeVisible();

  expect(screen.getByPlaceholder("Buscar un producto").query()).toBeNull();
  expect(screen.getByRole("combobox", { name: /^Categoría:/ }).query()).toBeNull();
  await expect.element(screen.getByRole("button", { name: "Revisión: Por revisar" })).toBeVisible();
});

test("typing a period drops the search from the filters it reports", async () => {
  const services = servicesWithOneProduct();
  const onFiltersChange = vi.fn();
  const screen = await renderControlledScreen(
    services,
    { review: "pending", search: "Arroz" },
    onFiltersChange,
  );
  await expect.element(screen.getByRole("table", PRICES_TABLE).getByText("Arroz")).toBeVisible();
  await expect.poll(() => periodSegments(screen).slice(0, 3)).toEqual(["31", "8", "2026"]);

  await typePeriodStart(screen, "01092026");

  await expect.element(screen.getByRole("table", REPORT_TABLE)).toBeVisible();
  expect(onFiltersChange).toHaveBeenLastCalledWith({
    search: "",
    category: "ALL",
    review: "pending",
    from: "2026-09-01",
    to: "2026-10-13",
  });
  expect(screen.getByPlaceholder("Buscar un producto").query()).toBeNull();
});

test("switching to Por revisar with a period already chosen drops the search, which does not come back once the period is erased", async () => {
  const services = servicesWithOneProduct();
  const onFiltersChange = vi.fn();
  const screen = await renderControlledScreen(
    services,
    { review: "all", search: "Arroz", ...PERIOD },
    onFiltersChange,
  );
  await expect.element(screen.getByRole("table", PRICES_TABLE).getByText("Arroz")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Revisión: Todos" }));
  await userEvent.click(screen.getByRole("option", { name: "Por revisar" }));

  await expect.element(screen.getByRole("table", REPORT_TABLE)).toBeVisible();
  expect(onFiltersChange).toHaveBeenLastCalledWith({
    search: "",
    category: "ALL",
    review: "pending",
    ...PERIOD,
  });

  await erasePeriodEnd(screen, "start");
  await erasePeriodEnd(screen, "end");

  await expect.element(screen.getByPlaceholder("Buscar un producto")).toHaveValue("");
  expect(onFiltersChange).toHaveBeenLastCalledWith({
    search: "",
    category: "ALL",
    review: "pending",
    from: "",
    to: "",
  });
});

test.each([
  { when: "no period is chosen", filters: {} },
  { when: "a period is chosen", filters: PERIOD },
])("downloads the report's spreadsheet when $when", async ({ filters }) => {
  const downloads = spyOnDownloads();
  const screen = await renderScreen(servicesWithOneProduct(), () => {}, {
    filters: { review: "pending", ...filters },
  });
  await expect.poll(() => periodSegments(screen).length).toBeGreaterThan(0);

  await userEvent.click(screen.getByRole("button", { name: "Descargar planilla" }));

  await expect.poll(() => downloads.names).toHaveLength(1);
  expect(downloads.names[0]).toMatch(/^precios-sin-revisar-.*\.xlsx$/);
  const file = await readDownloadedXlsx(downloads.blobs[0]);
  expect(file.sheetNames).toEqual(["Resumen", "Precios sin revisar"]);
});

test.each(["overdue", "all"] as const)(
  "lists the prices under %s with no period, no download and no report read",
  async (review) => {
    const services = servicesWithOneProduct();
    const screen = await renderScreen(services, () => {}, { filters: { review } });
    await expect.element(screen.getByText("Arroz")).toBeVisible();

    expect(screen.getByRole("group", { name: /^Período/ }).query()).toBeNull();
    expect(screen.getByRole("button", { name: "Descargar planilla" }).query()).toBeNull();
    expect(screen.getByRole("table", REPORT_TABLE).query()).toBeNull();
    expect(services.fetchPricesPastReviewDeadlineReport).not.toHaveBeenCalled();
  },
);

test("choosing Por revisar from another option shows the period beside the prices", async () => {
  const onFiltersChange = vi.fn();
  const screen = await renderControlledScreen(
    servicesWithOneProduct(),
    { review: "all" },
    onFiltersChange,
  );
  await expect.element(screen.getByText("Arroz")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Revisión: Todos" }));
  await userEvent.click(screen.getByRole("option", { name: "Por revisar" }));

  await expect.element(screen.getByRole("button", { name: "Descargar planilla" })).toBeVisible();
  await expect.element(screen.getByRole("table", PRICES_TABLE)).toBeVisible();
  expect(onFiltersChange).toHaveBeenLastCalledWith(expect.objectContaining({ review: "pending" }));
});
