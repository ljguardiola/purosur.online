import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useDocumentTitle } from "../shell/document-title";
import { PurchaseOrderScreen } from "./purchase-order-screen";
import { defaultPurchaseOrderScreenServices } from "./purchase-order-services";

const route = getRouteApi("/signed-in/orders-area/purchase-orders/$orderId");

export function PurchaseOrderPage(): ReactElement {
  const { services, sessionActions } = route.useRouteContext();
  const { orderId } = route.useParams();
  const navigate = route.useNavigate();
  useDocumentTitle("Pedido · Puro Sur");
  return (
    <PurchaseOrderScreen
      orderId={orderId}
      onBack={() => void navigate({ to: "/purchase-orders" })}
      onSessionEnded={sessionActions.sessionEnded}
      services={services.purchaseOrderScreen ?? defaultPurchaseOrderScreenServices}
    />
  );
}
