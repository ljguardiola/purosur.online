import { FieldSizeProvider } from "@purosur/ui";
import { useState } from "react";
import { vi } from "vitest";
import { render } from "../../shell/test-support/render-with-router";
import {
  createReportRegisterFilterServices,
  type ReportRegisterFilterServices,
  reportRegisterFieldForTests,
} from "../../shell/test-support/report-register-filter";
import {
  type SalesByPaymentMethodFilters,
  salesByPaymentMethodFilters,
} from "../sales-by-payment-method-filters";
import { SalesByPaymentMethodScreen } from "../sales-by-payment-method-screen";
import type { SalesByPaymentMethodScreenServices } from "../sales-by-payment-method-services";
import { weekHandConfirmedReport, weekPaymentsReport } from "./payments-report-fixtures";

export function createSalesByPaymentMethodServices(): SalesByPaymentMethodScreenServices {
  const services = { fetchSalesByPaymentMethod: vi.fn(), fetchHandConfirmedPayments: vi.fn() };
  services.fetchSalesByPaymentMethod.mockResolvedValue({ kind: "ok", value: weekPaymentsReport });
  services.fetchHandConfirmedPayments.mockResolvedValue({
    kind: "ok",
    value: weekHandConfirmedReport,
  });
  return services;
}

type Handlers = {
  onFiltersChange?: (filters: SalesByPaymentMethodFilters) => void;
  onSessionEnded?: () => void;
};

function ControlledScreen({
  services,
  filters: initial,
  onFiltersChange = () => {},
  onSessionEnded = () => {},
  registerServices,
}: Handlers & {
  services: SalesByPaymentMethodScreenServices;
  filters: SalesByPaymentMethodFilters;
  registerServices: ReportRegisterFilterServices;
}) {
  const [filters, setFilters] = useState(initial);
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <SalesByPaymentMethodScreen
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

export function renderSalesByPaymentMethod(
  services: SalesByPaymentMethodScreenServices,
  {
    filters = {},
    registerServices = createReportRegisterFilterServices(),
    ...handlers
  }: Handlers & {
    filters?: Partial<SalesByPaymentMethodFilters>;
    registerServices?: ReportRegisterFilterServices;
  } = {},
) {
  return render(
    <ControlledScreen
      services={services}
      filters={salesByPaymentMethodFilters.parse(filters)}
      registerServices={registerServices}
      {...handlers}
    />,
  );
}
