import { getRouteApi, useRouterState } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useDocumentTitle } from "../shell/document-title";
import { purchaseOrderReceivedIn } from "./purchase-order-received-state";
import { PurchaseOrderScreen } from "./purchase-order-screen";
import { defaultPurchaseOrderScreenServices } from "./purchase-order-services";

const route = getRouteApi("/signed-in/orders-area/purchase-orders/$orderId");

export function PurchaseOrderPage(): ReactElement {
  const { services, session, sessionActions } = route.useRouteContext();
  const { orderId } = route.useParams();
  const navigate = route.useNavigate();
  const received = useRouterState({
    select: (state) => purchaseOrderReceivedIn(state.location.state),
  });
  useDocumentTitle("Pedido · Puro Sur");
  return (
    <PurchaseOrderScreen
      orderId={orderId}
      access={session}
      received={received}
      onBack={() => void navigate({ to: "/purchase-orders" })}
      onReceive={() =>
        void navigate({ to: "/purchase-orders/$orderId/receive", params: { orderId } })
      }
      onOpenPurchases={() => void navigate({ to: "/purchases" })}
      onNoticeDismissed={() => void navigate({ replace: true, state: {} })}
      onSessionEnded={sessionActions.sessionEnded}
      services={services.purchaseOrderScreen ?? defaultPurchaseOrderScreenServices}
    />
  );
}
