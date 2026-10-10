import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useDocumentTitle } from "../shell/document-title";
import { NewPurchaseScreen } from "./new-purchase-screen";
import { defaultNewPurchaseScreenServices } from "./new-purchase-services";
import { purchaseDayOf } from "./purchase-date";

const route = getRouteApi("/signed-in/stock-area/purchases/new");

export function NewPurchasePage(): ReactElement {
  const { services, session, sessionActions } = route.useRouteContext();
  const { openedAt } = route.useLoaderData();
  useDocumentTitle("Registrar compra · Puro Sur");
  return (
    <NewPurchaseScreen
      access={session}
      onSessionEnded={sessionActions.sessionEnded}
      services={services.newPurchaseScreen ?? defaultNewPurchaseScreenServices}
      today={purchaseDayOf(openedAt)}
    />
  );
}
