import type { Capability } from "@purosur/domain";
import { vi } from "vitest";
import { weekChargeCosts } from "../../payments/test-support/mercado-pago-charge-costs-fixtures";
import {
  weekHandConfirmedReport,
  weekPaymentsReport,
} from "../../payments/test-support/payments-report-fixtures";
import { returnsReport } from "../../returns/test-support/returns-fixtures";
import { handTypedWeightsReport } from "../../sales/test-support/hand-typed-weights-fixtures";
import {
  averageTicketReport,
  cashierSalesReport,
  cashRoundingReport,
  categoryProductsReport,
  manualDiscountsReport,
  promotionDiscountsReport,
  weekReport,
} from "../../sales/test-support/sales-fixtures";
import { openSession } from "../../sessions/test-support/open-session";
import { categoryMarginReport } from "../../stock/test-support/margin-report-fixtures";
import { createAppServices } from "./app-services";
import { registers } from "./report-fixtures";

export function reportsServices(capabilities: Capability[]) {
  const services = createAppServices({
    fetchSession: vi.fn().mockResolvedValue(
      openSession({
        userId: "user-2",
        displayName: "Lucía Ferreyra",
        isAdministrator: false,
        capabilities,
      }),
    ),
  });
  vi.mocked(services.ownCredentialsSection.fetchPasskeys).mockResolvedValue({
    kind: "ok",
    value: [],
  });
  vi.mocked(services.salesByDayScreen.fetchSalesReport).mockResolvedValue({
    kind: "ok",
    value: weekReport,
  });
  vi.mocked(services.salesByPaymentMethodScreen.fetchSalesByPaymentMethod).mockResolvedValue({
    kind: "ok",
    value: weekPaymentsReport,
  });
  vi.mocked(services.salesByPaymentMethodScreen.fetchHandConfirmedPayments).mockResolvedValue({
    kind: "ok",
    value: weekHandConfirmedReport,
  });
  vi.mocked(
    services.salesByProductAndCategoryScreen.fetchSalesByProductAndCategory,
  ).mockResolvedValue({ kind: "ok", value: categoryProductsReport });
  vi.mocked(services.salesByCashierScreen.fetchSalesByCashier).mockResolvedValue({
    kind: "ok",
    value: cashierSalesReport,
  });
  vi.mocked(services.handTypedWeightsScreen.fetchHandTypedWeights).mockResolvedValue({
    kind: "ok",
    value: handTypedWeightsReport,
  });
  vi.mocked(services.salesByPromotionScreen.fetchSalesByPromotion).mockResolvedValue({
    kind: "ok",
    value: promotionDiscountsReport,
  });
  vi.mocked(services.manualDiscountsScreen.fetchManualDiscounts).mockResolvedValue({
    kind: "ok",
    value: manualDiscountsReport,
  });
  vi.mocked(services.cashRoundingScreen.fetchCashRounding).mockResolvedValue({
    kind: "ok",
    value: cashRoundingReport,
  });
  vi.mocked(services.averageTicketScreen.fetchAverageTicket).mockResolvedValue({
    kind: "ok",
    value: averageTicketReport,
  });
  vi.mocked(services.marginReportScreen.fetchMarginReport).mockResolvedValue({
    kind: "ok",
    value: categoryMarginReport,
  });
  vi.mocked(services.mercadoPagoChargeCostsScreen.fetchMercadoPagoChargeCosts).mockResolvedValue({
    kind: "ok",
    value: weekChargeCosts,
  });
  vi.mocked(services.returnsHistoryScreen.fetchReturnsReport).mockResolvedValue({
    kind: "ok",
    value: returnsReport,
  });
  vi.mocked(services.reportRegisterFilter.fetchReportRegisters).mockResolvedValue({
    kind: "ok",
    value: registers,
  });
  return services;
}
