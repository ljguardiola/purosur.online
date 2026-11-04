import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useDocumentTitle } from "../shell/document-title";
import { PendingPurchaseOrdersReportScreen } from "./pending-purchase-orders-report-screen";
import { defaultPendingPurchaseOrdersReportScreenServices } from "./pending-purchase-orders-report-services";

const route = getRouteApi("/signed-in/reports-area/reports/pending-purchase-orders");

export function PendingPurchaseOrdersReportPage(): ReactElement {
  const { services, sessionActions } = route.useRouteContext();
  const filters = route.useSearch();
  const navigate = route.useNavigate();
  useDocumentTitle("Pedidos pendientes de recibir · Puro Sur");
  return (
    <PendingPurchaseOrdersReportScreen
      filters={filters}
      onFiltersChange={(next) => void navigate({ search: next, replace: true })}
      onOpenOrder={(orderId) =>
        void navigate({ to: "/purchase-orders/$orderId", params: { orderId } })
      }
      onSessionEnded={sessionActions.sessionEnded}
      services={
        services.pendingPurchaseOrdersReportScreen ??
        defaultPendingPurchaseOrdersReportScreenServices
      }
    />
  );
}
