import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { useState } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { type ReportPeriodFilters, reportPeriodSearch } from "../shell/report-filters-search";
import { render } from "../shell/test-support/render-with-router";
import { ReceiptDifferencesReportScreen } from "./receipt-differences-report-screen";
import type { ReceiptDifferencesReportScreenServices } from "./receipt-differences-report-services";
import { receiptDifferencesReport } from "./test-support/receipt-differences-report-fixtures";

beforeEach(async () => {
  await page.viewport(1280, 900);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function createServices(): ReceiptDifferencesReportScreenServices {
  const services = { fetchReceiptDifferencesReport: vi.fn() };
  services.fetchReceiptDifferencesReport.mockResolvedValue({
    kind: "ok",
    value: receiptDifferencesReport,
  });
  return services;
}

type Handlers = {
  filters?: ReportPeriodFilters;
  onFiltersChange?: (filters: ReportPeriodFilters) => void;
  onSessionEnded?: () => void;
};

function ControlledScreen({
  services,
  filters: initial = reportPeriodSearch.parse({}),
  onFiltersChange = () => {},
  onSessionEnded = () => {},
}: Handlers & { services: ReceiptDifferencesReportScreenServices }) {
  const [filters, setFilters] = useState(initial);
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <ReceiptDifferencesReportScreen
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

function renderScreen(services: ReceiptDifferencesReportScreenServices, handlers: Handlers = {}) {
  return render(<ControlledScreen services={services} {...handlers} />);
}

const TITLE = "Diferencias de recepción";

test("titles the report under the purchases reports", async () => {
  const screen = await renderScreen(createServices());

  await expect.element(screen.getByRole("heading", { name: TITLE, level: 1 })).toBeVisible();
  await expect.element(screen.getByText("Reportes · Compras", { exact: true })).toBeVisible();
  await expectNoAccessibilityViolations(screen.container);
});
