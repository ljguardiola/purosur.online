import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { beforeEach, expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { reportPeriodSearch } from "../shell/report-filters-search";
import { render } from "../shell/test-support/render-with-router";
import { FreightReportScreen } from "./freight-report-screen";
import { quarterFreightReport } from "./test-support/freight-report-fixtures";

beforeEach(async () => {
  await page.viewport(1280, 900);
});

const TITLE = "Flete por período";

test("titles the report under the purchases reports", async () => {
  const screen = await render(
    <FieldSizeProvider size="backoffice">
      <main>
        <FreightReportScreen
          services={{
            fetchFreightReport: vi
              .fn()
              .mockResolvedValue({ kind: "ok", value: quarterFreightReport }),
          }}
          filters={reportPeriodSearch.parse({})}
          onFiltersChange={() => {}}
          onSessionEnded={() => {}}
        />
      </main>
    </FieldSizeProvider>,
  );

  await expect.element(screen.getByRole("heading", { name: TITLE, level: 1 })).toBeVisible();
  await expect.element(screen.getByText("Reportes · Compras", { exact: true })).toBeVisible();
  await expectNoAccessibilityViolations(screen.container);
});
