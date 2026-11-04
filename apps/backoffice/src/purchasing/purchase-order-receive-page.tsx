import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useDocumentTitle } from "../shell/document-title";
import { PurchaseOrderReceiveScreen } from "./purchase-order-receive-screen";
import { defaultPurchaseOrderReceiveScreenServices } from "./purchase-order-receive-services";

const route = getRouteApi("/signed-in/orders-area/purchase-orders/$orderId/receive");

export function PurchaseOrderReceivePage(): ReactElement {
  const { services, session, sessionActions } = route.useRouteContext();
  const { orderId } = route.useParams();
  useDocumentTitle("Recibir pedido · Puro Sur");
  return (
    <PurchaseOrderReceiveScreen
      orderId={orderId}
      access={session}
      productCreationModal={services.productCreationModal}
      onSessionEnded={sessionActions.sessionEnded}
      services={services.purchaseOrderReceiveScreen ?? defaultPurchaseOrderReceiveScreenServices}
    />
  );
}
