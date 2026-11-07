import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { expect, test, vi } from "vitest";
import { render } from "../shell/test-support/render-with-router";
import {
  createReportRegisterFilterServices,
  reportRegisterFieldForTests,
} from "../shell/test-support/report-register-filter";
import { handConfirmedPaymentsFilters } from "./hand-confirmed-payments-filters";
import { HandConfirmedPaymentsScreen } from "./hand-confirmed-payments-screen";
import { weekHandConfirmedReport } from "./test-support/payments-report-fixtures";

test("names the report and shows its payments", async () => {
  const services = { fetchHandConfirmedPayments: vi.fn() };
  services.fetchHandConfirmedPayments.mockResolvedValue({
    kind: "ok",
    value: weekHandConfirmedReport,
  });
  const registerServices = createReportRegisterFilterServices();

  const screen = await render(
    <FieldSizeProvider size="backoffice">
      <main>
        <HandConfirmedPaymentsScreen
          services={services}
          filters={handConfirmedPaymentsFilters.parse({})}
          onFiltersChange={() => {}}
          onSessionEnded={() => {}}
          registerFilter={reportRegisterFieldForTests(registerServices, () => {})}
        />
      </main>
    </FieldSizeProvider>,
  );

  await expect
    .element(screen.getByRole("heading", { name: "Pagos confirmados a mano", level: 1 }))
    .toBeVisible();
  await expect.element(screen.getByText("Reportes · Caja", { exact: true })).toBeVisible();
  await expect.element(screen.getByText(/^Pagos\$ 1\.900,003$/)).toBeVisible();
  await expectNoAccessibilityViolations(screen.container);
});
