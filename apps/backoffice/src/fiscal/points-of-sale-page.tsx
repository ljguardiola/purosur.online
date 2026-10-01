import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useDocumentTitle } from "../shell/document-title";
import { PointsOfSaleScreen } from "./points-of-sale-screen";

const route = getRouteApi("/signed-in/cash-and-fiscal-area/points-of-sale");

export function PointsOfSalePage(): ReactElement {
  const { services, sessionActions } = route.useRouteContext();
  useDocumentTitle("Puntos de venta · Puro Sur");
  return (
    <PointsOfSaleScreen
      onSessionEnded={sessionActions.sessionEnded}
      services={services.pointsOfSaleScreen}
    />
  );
}
