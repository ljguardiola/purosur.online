import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useDocumentTitle } from "../shell/document-title";
import { NewPurchaseScreen } from "./new-purchase-screen";

const route = getRouteApi("/signed-in/stock-area/purchases/new");

export function NewPurchasePage(): ReactElement {
  const { services, sessionActions } = route.useRouteContext();
  useDocumentTitle("Registrar compra · Puro Sur");
  return (
    <NewPurchaseScreen
      onSessionEnded={sessionActions.sessionEnded}
      services={services.newPurchaseScreen}
    />
  );
}
