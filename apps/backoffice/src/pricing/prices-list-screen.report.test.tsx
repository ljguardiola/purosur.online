import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { readDownloadedXlsx } from "../platform/spreadsheet/test-support/read-xlsx";
import { periodSegments, typePeriodStart } from "../shell/test-support/report-dates";
import { spyOnDownloads } from "../shell/test-support/spy-on-downloads";
import {
  createServices,
  renderControlledScreen,
  renderScreen,
  rice,
} from "./test-support/prices-list-screen";

const REPORT_TABLE = { name: "Precios sin revisar" } as const;

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

test("under Por revisar shows the prices past their review deadline instead of the prices table", async () => {
  const services = servicesWithOneProduct();
  const screen = await renderScreen(services, () => {}, { filters: { review: "pending" } });

  await expect.element(screen.getByRole("table", REPORT_TABLE)).toBeVisible();
  await expect.element(screen.getByText("Queso cremoso")).toBeVisible();
  await expect.element(screen.getByText("2 precios", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("Plazo de revisión: 30 días")).toBeVisible();
  expect(screen.getByRole("table", { name: "Precios", exact: true }).query()).toBeNull();
  expect(services.fetchPricesPastReviewDeadlineReport).toHaveBeenCalledWith({});
});

test("under Por revisar offers the period and the spreadsheet download", async () => {
  const downloads = spyOnDownloads();
  const screen = await renderScreen(servicesWithOneProduct(), () => {}, {
    filters: { review: "pending" },
  });
  await expect.poll(() => periodSegments(screen).slice(0, 3)).toEqual(["31", "8", "2026"]);

  await userEvent.click(screen.getByRole("button", { name: "Descargar planilla" }));

  await expect
    .poll(() => downloads.names)
    .toEqual(["precios-sin-revisar-2026-08-31-2026-10-13.xlsx"]);
  const file = await readDownloadedXlsx(downloads.blobs[0]);
  expect(file.sheetNames).toEqual(["Resumen", "Precios sin revisar"]);
});

test("asks the report for the period the URL carries", async () => {
  const services = servicesWithOneProduct();

  await renderScreen(services, () => {}, {
    filters: { review: "pending", from: "2026-10-02", to: "2026-10-05" },
  });

  await expect
    .poll(() => vi.mocked(services.fetchPricesPastReviewDeadlineReport).mock.lastCall)
    .toEqual([{ from: "2026-10-02", to: "2026-10-05" }]);
});

test("reports a typed period together with the list filters and asks the report again", async () => {
  const services = servicesWithOneProduct();
  const onFiltersChange = vi.fn();
  const screen = await renderControlledScreen(services, { review: "pending" }, onFiltersChange);
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
});

test("choosing Por revisar reports the choice and shows the report", async () => {
  const onFiltersChange = vi.fn();
  const screen = await renderControlledScreen(
    servicesWithOneProduct(),
    { review: "all" },
    onFiltersChange,
  );
  await expect.element(screen.getByText("Arroz")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Revisión: Todos" }));
  await userEvent.click(screen.getByRole("option", { name: "Por revisar" }));

  await expect.element(screen.getByRole("table", REPORT_TABLE)).toBeVisible();
  expect(onFiltersChange).toHaveBeenLastCalledWith(expect.objectContaining({ review: "pending" }));
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

test("keeps the review action beside the report", async () => {
  const screen = await renderScreen(servicesWithOneProduct(), () => {}, {
    filters: { review: "pending" },
  });

  await expect.element(screen.getByRole("button", { name: "Revisar 1" })).toBeVisible();
});
