import { FieldSizeProvider } from "@purosur/ui";
import { useState } from "react";
import { vi } from "vitest";
import type { z } from "zod";
import type { BackofficeAccess } from "../../shell/backoffice-access";
import { ADMINISTRATOR_ACCESS } from "../../shell/test-support/backoffice-access";
import { render } from "../../shell/test-support/render-with-router";
import { type PurchaseOrdersFilters, purchaseOrdersFilters } from "../purchase-orders-filters";
import { PurchaseOrdersListScreen } from "../purchase-orders-list-screen";
import type { PurchaseOrdersListScreenServices } from "../purchase-orders-list-services";
import type { SupplierFilter } from "../purchasing-screen-parts";
import { pendingPurchaseOrdersReport } from "./pending-purchase-orders-report-fixtures";
import { createPanelServices } from "./purchase-order-panel";
import { DRAFT_SUMMARY } from "./purchase-orders";
import { receiptDifferencesReport } from "./receipt-differences-report-fixtures";

export function createServices(
  overrides: Partial<PurchaseOrdersListScreenServices> = {},
): PurchaseOrdersListScreenServices {
  return {
    fetchPurchaseOrders: vi.fn().mockResolvedValue({ kind: "ok", value: [DRAFT_SUMMARY] }),
    fetchSupplierName: vi.fn().mockResolvedValue({
      kind: "ok",
      value: { kind: "found", name: "Distribuidora Andina" },
    }),
    fetchPendingPurchaseOrdersReport: vi
      .fn()
      .mockResolvedValue({ kind: "ok", value: pendingPurchaseOrdersReport }),
    fetchReceiptDifferencesReport: vi
      .fn()
      .mockResolvedValue({ kind: "ok", value: receiptDifferencesReport }),
    ...createPanelServices(),
    ...overrides,
  };
}

export type ScreenOptions = {
  filters?: Partial<z.input<typeof purchaseOrdersFilters>>;
  onFiltersChange?: (filters: PurchaseOrdersFilters) => void;
  access?: BackofficeAccess;
  openOrder?: string;
  received?: boolean;
  onOpenOrderChange?: (orderId: string | undefined) => void;
  onReceive?: (orderId: string) => void;
  onOpenPurchases?: () => void;
  onReceivedNoticeDismissed?: () => void;
  onSessionEnded?: () => void;
  supplierFilter?: SupplierFilter;
};

function ControlledScreen({
  services,
  filters: initial = {},
  onFiltersChange = () => {},
  access = ADMINISTRATOR_ACCESS,
  openOrder,
  received = false,
  onOpenOrderChange = () => {},
  onReceive = () => {},
  onOpenPurchases = () => {},
  onReceivedNoticeDismissed = () => {},
  onSessionEnded = () => {},
  supplierFilter,
}: ScreenOptions & { services: PurchaseOrdersListScreenServices }) {
  const [filters, setFilters] = useState(purchaseOrdersFilters.parse(initial));
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <PurchaseOrdersListScreen
          services={services}
          filters={filters}
          onFiltersChange={(next) => {
            onFiltersChange(next);
            setFilters(next);
          }}
          access={access}
          openOrder={openOrder}
          received={received}
          onOpenOrderChange={onOpenOrderChange}
          onReceive={onReceive}
          onOpenPurchases={onOpenPurchases}
          onReceivedNoticeDismissed={onReceivedNoticeDismissed}
          onSessionEnded={onSessionEnded}
          supplierFilter={supplierFilter}
        />
      </main>
    </FieldSizeProvider>
  );
}

export function renderScreen(
  services: PurchaseOrdersListScreenServices,
  options: ScreenOptions = {},
) {
  return render(<ControlledScreen services={services} {...options} />);
}

export type Screen = Awaited<ReturnType<typeof renderScreen>>;
