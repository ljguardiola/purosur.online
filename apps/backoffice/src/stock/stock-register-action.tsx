import { getRouteApi, useNavigate } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { defaultInitialInventoryScreenServices } from "./initial-inventory-services";
import { defaultStockBalancesScreenServices } from "./stock-balances-services";
import { StockRegisterMenu } from "./stock-register-menu";

const route = getRouteApi("/signed-in/stock-area/stock");

export function StockRegisterAction(): ReactElement {
  const { services, session, sessionActions } = route.useRouteContext();
  const { register } = route.useSearch();
  const navigate = useNavigate();
  return (
    <StockRegisterMenu
      access={session}
      productCreationModal={services.productCreationModal}
      services={services.stockBalancesScreen ?? defaultStockBalancesScreenServices}
      initialInventoryServices={
        services.initialInventoryScreen ?? defaultInitialInventoryScreenServices
      }
      initialInventoryOpen={register === "initial-inventory"}
      onInitialInventoryOpenChange={(open) =>
        void navigate({
          to: ".",
          search: (current) => ({
            ...current,
            register: open ? "initial-inventory" : undefined,
          }),
          replace: !open,
        })
      }
      onSessionEnded={sessionActions.sessionEnded}
    />
  );
}
