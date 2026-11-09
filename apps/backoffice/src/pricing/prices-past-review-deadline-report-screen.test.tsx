import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { useState } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { type ReportPeriodFilters, reportPeriodSearch } from "../shell/report-filters-search";
import { render } from "../shell/test-support/render-with-router";
import { PricesPastReviewDeadlineReportScreen } from "./prices-past-review-deadline-report-screen";
import type { PricesPastReviewDeadlineReportScreenServices } from "./prices-past-review-deadline-report-services";
import { pricesPastReviewDeadlineReport } from "./test-support/prices-past-review-deadline-report-fixtures";

beforeEach(async () => {
  await page.viewport(1280, 900);
});

afterEach(() => {
  vi.restoreAllMocks();
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

test("titles the report under the price reports", async () => {
  const screen = await renderScreen(listed());

  await expect
    .element(screen.getByRole("heading", { name: "Precios sin revisar", level: 1 }))
    .toBeVisible();
  await expect.element(screen.getByText("Reportes · Precios")).toBeVisible();
  await expect.element(screen.getByText("Queso cremoso")).toBeVisible();
  await expectNoAccessibilityViolations(screen.container);
});
