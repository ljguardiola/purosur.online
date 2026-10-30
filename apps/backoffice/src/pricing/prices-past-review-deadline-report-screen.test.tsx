import { FieldSizeProvider, formatCalendarDayNumeric } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { useState } from "react";
import { beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { type ReportPeriodFilters, reportPeriodSearch } from "../shell/report-filters-search";
import { render } from "../shell/test-support/render-with-router";
import { dateSegments, typeDate } from "../shell/test-support/report-dates";
import { formatCentsWithUnit } from "./money";
import { PricesPastReviewDeadlineReportScreen } from "./prices-past-review-deadline-report-screen";
import type { PricesPastReviewDeadlineReportScreenServices } from "./prices-past-review-deadline-report-services";
import {
  neverReviewedOil,
  overdueCheese,
  postponedBread,
  pricesPastReviewDeadlineReport,
} from "./test-support/prices-past-review-deadline-report-fixtures";

beforeEach(async () => {
  await page.viewport(1280, 900);
});

function createServices(): PricesPastReviewDeadlineReportScreenServices {
  return { fetchPricesPastReviewDeadlineReport: vi.fn() };
}

function listed(report = pricesPastReviewDeadlineReport()) {
  const services = createServices();
  vi.mocked(services.fetchPricesPastReviewDeadlineReport).mockResolvedValue({
    kind: "ok",
    value: report,
  });
  return services;
}

function Harness({
  services,
  initial = reportPeriodSearch.parse({}),
  onFiltersChange = () => {},
  onSessionEnded = () => {},
}: {
  services: PricesPastReviewDeadlineReportScreenServices;
  initial?: ReportPeriodFilters;
  onFiltersChange?: (filters: ReportPeriodFilters) => void;
  onSessionEnded?: () => void;
}) {
  const [filters, setFilters] = useState(initial);
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <PricesPastReviewDeadlineReportScreen
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

function renderScreen(
  services: PricesPastReviewDeadlineReportScreenServices,
  props: Omit<Parameters<typeof Harness>[0], "services"> = {},
) {
  return render(<Harness services={services} {...props} />);
}

const TABLE = { name: "Precios sin revisar" } as const;

test("titles the report under the price reports", async () => {
  const screen = await renderScreen(listed());

  await expect
    .element(screen.getByRole("heading", { name: "Precios sin revisar", level: 1 }))
    .toBeVisible();
  await expect.element(screen.getByText("Reportes · Precios")).toBeVisible();
});

test("states the configured review window", async () => {
  const screen = await renderScreen(listed());

  await expect.element(screen.getByText("Plazo de revisión: 30 días")).toBeVisible();
});

test("says the window in the singular", async () => {
  const screen = await renderScreen(
    listed(pricesPastReviewDeadlineReport([overdueCheese], { window_days: 1 })),
  );

  await expect.element(screen.getByText("Plazo de revisión: 1 día")).toBeVisible();
});

test("counts the prices past their deadline", async () => {
  const screen = await renderScreen(listed());

  await expect.element(screen.getByText("Precios", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("2 precios", { exact: true })).toBeVisible();
});

test("shows each price with its product, category, current price, last review, deadline day and reason", async () => {
  const screen = await renderScreen(listed());

  const row = screen
    .getByRole("table", TABLE)
    .getByRole("row")
    .filter({ hasText: "Queso cremoso" });
  await expect.element(row.getByText("Lácteos")).toBeVisible();
  await expect.element(row.getByText(formatCentsWithUnit(1_250_000, "KG"))).toBeVisible();
  await expect.element(row.getByText("01/08/2026 · 10:00")).toBeVisible();
  await expect.element(row.getByText(formatCalendarDayNumeric("2026-08-31"))).toBeVisible();
  await expect.element(row.getByText("Plazo vencido")).toBeVisible();
  await expectNoAccessibilityViolations(screen.container);
});

test("shows a price never reviewed and without a price in words, and its missing deadline day as a dash", async () => {
  const screen = await renderScreen(listed());

  const row = screen
    .getByRole("table", TABLE)
    .getByRole("row")
    .filter({ hasText: "Aceite de Almendras Vitora 30 ml" });
  await expect.element(row.getByText("Sin precio")).toBeVisible();
  await expect.element(row.getByText("Nunca")).toBeVisible();
  await expect.element(row.getByText("—")).toBeVisible();
  await expect.element(row.getByText("Nunca revisado")).toBeVisible();
});

test("says a price postponed in a purchase was postponed", async () => {
  const screen = await renderScreen(listed(pricesPastReviewDeadlineReport([postponedBread])));

  await expect.element(screen.getByText("Postergado en una compra")).toBeVisible();
});

test("lists the prices in the order the cloud answers them", async () => {
  const screen = await renderScreen(
    listed(pricesPastReviewDeadlineReport([postponedBread, overdueCheese, neverReviewedOil])),
  );
  await expect.element(screen.getByText("Pan lactal")).toBeVisible();

  const names = screen
    .getByRole("table", TABLE)
    .getByRole("row")
    .elements()
    .map((row) =>
      ["Aceite de Almendras", "Pan lactal", "Queso cremoso"].find((name) =>
        row.textContent?.includes(name),
      ),
    )
    .filter((name) => name !== undefined);
  expect(names).toEqual(["Pan lactal", "Queso cremoso", "Aceite de Almendras"]);
});

test("shows the period the cloud answered while the URL names none", async () => {
  const screen = await renderScreen(listed());

  await expect.poll(() => dateSegments(screen, "Desde")).toEqual(["31", "8", "2026"]);
  expect(dateSegments(screen, "Hasta")).toEqual(["13", "10", "2026"]);
});

test("asks for the cloud's default period when the URL names none", async () => {
  const services = listed();

  await renderScreen(services);

  await expect.poll(() => services.fetchPricesPastReviewDeadlineReport).toHaveBeenCalledWith({});
});

test("asks for the period the URL carries", async () => {
  const services = listed();

  await renderScreen(services, {
    initial: reportPeriodSearch.parse({ from: "2026-12-01", to: "2026-12-31" }),
  });

  await expect
    .poll(() => services.fetchPricesPastReviewDeadlineReport)
    .toHaveBeenCalledWith({ from: "2026-12-01", to: "2026-12-31" });
});

test("reports the period typed once both days are complete", async () => {
  const onFiltersChange = vi.fn();
  const screen = await renderScreen(listed(), { onFiltersChange });
  await expect.poll(() => dateSegments(screen, "Desde")).toEqual(["31", "8", "2026"]);

  await typeDate(screen, "Desde", "01092026");

  await expect
    .poll(() => onFiltersChange.mock.lastCall?.[0])
    .toEqual({ from: "2026-09-01", to: "2026-10-13" });
});

test("keeps showing the report while the next period loads", async () => {
  const services = listed();
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Queso cremoso")).toBeVisible();
  vi.mocked(services.fetchPricesPastReviewDeadlineReport).mockReturnValue(new Promise(() => {}));

  await typeDate(screen, "Desde", "01092026");

  await expect
    .poll(() => services.fetchPricesPastReviewDeadlineReport)
    .toHaveBeenLastCalledWith({ from: "2026-09-01", to: "2026-10-13" });
  await expect.element(screen.getByText("Queso cremoso")).toBeVisible();
  await expect.element(screen.getByRole("table", TABLE)).toHaveAttribute("aria-busy", "true");
});

test("drops the previous report's window when the next period fails to load", async () => {
  const services = listed();
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Plazo de revisión: 30 días")).toBeVisible();
  vi.mocked(services.fetchPricesPastReviewDeadlineReport).mockResolvedValue({ kind: "failed" });

  await typeDate(screen, "Desde", "01092026");

  await expect.element(screen.getByText("No pudimos abrir los precios sin revisar")).toBeVisible();
  expect(screen.getByText("Plazo de revisión", { exact: false }).query()).toBeNull();
});

test("shows the screen loading while the report is on its way", async () => {
  const services = createServices();
  vi.mocked(services.fetchPricesPastReviewDeadlineReport).mockReturnValue(new Promise(() => {}));

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Precios", { exact: true })).toBeVisible();
  expect(screen.getByText("Plazo de revisión", { exact: false }).query()).toBeNull();
  await expect.element(screen.getByRole("table", TABLE)).toHaveAttribute("aria-busy", "true");
});

test("says no price is past its deadline when the report is empty", async () => {
  const screen = await renderScreen(listed(pricesPastReviewDeadlineReport([])));

  await expect
    .element(screen.getByText("No hay precios sin revisar en este período"))
    .toBeVisible();
  await expect.element(screen.getByText("0 precios").first()).toBeVisible();
});

test("shows a failed load with a retry that loads the report again, and no figures", async () => {
  const services = createServices();
  vi.mocked(services.fetchPricesPastReviewDeadlineReport)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockResolvedValueOnce({
      kind: "ok",
      value: pricesPastReviewDeadlineReport([overdueCheese]),
    });
  const screen = await renderScreen(services);

  await expect.element(screen.getByText("No pudimos abrir los precios sin revisar")).toBeVisible();
  expect(screen.getByText("Precios", { exact: true }).query()).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByText("Queso cremoso")).toBeVisible();
  expect(services.fetchPricesPastReviewDeadlineReport).toHaveBeenCalledTimes(2);
});

test("ends the session when the cloud says it is over", async () => {
  const services = createServices();
  vi.mocked(services.fetchPricesPastReviewDeadlineReport).mockResolvedValue({
    kind: "unauthenticated",
  });
  const onSessionEnded = vi.fn();

  await renderScreen(services, { onSessionEnded });

  await expect.poll(() => onSessionEnded).toHaveBeenCalled();
});

test("navigates to Mi cuenta when the report request comes back forbidden", async () => {
  const services = createServices();
  vi.mocked(services.fetchPricesPastReviewDeadlineReport).mockResolvedValue({ kind: "forbidden" });

  await renderScreen(services);

  await expect.poll(() => window.location.pathname).toBe("/account");
});

test("counts the prices past their deadline with the thousands separator", async () => {
  const report = pricesPastReviewDeadlineReport([overdueCheese]);
  const screen = await renderScreen(
    listed({ ...report, summary: { price_count: 1998 } }),
  );

  await expect.element(screen.getByText("1.998 precios", { exact: true })).toBeVisible();
});
