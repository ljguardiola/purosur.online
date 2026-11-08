import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useDocumentTitle } from "../shell/document-title";
import { SupplierPriceListReviewScreen } from "./supplier-price-list-review-screen";
import { defaultSupplierPriceListReviewScreenServices } from "./supplier-price-list-review-services";

const route = getRouteApi("/signed-in/purchasing-area/supplier-price-lists/$listId");

export function SupplierPriceListReviewPage(): ReactElement {
  const { session, services, sessionActions } = route.useRouteContext();
  const { listId } = route.useParams();
  const filters = route.useSearch();
  const navigate = route.useNavigate();
  useDocumentTitle("Revisar una lista · Puro Sur");
  return (
    <SupplierPriceListReviewScreen
      listId={listId}
      access={session}
      categoryCreationModal={services.categoryCreationModal}
      productCreationModal={services.productCreationModal}
      filters={filters}
      onFiltersChange={(next) => void navigate({ search: next, replace: true })}
      onBack={() => void navigate({ to: "/suppliers/price-lists" })}
      onSessionEnded={sessionActions.sessionEnded}
      services={
        services.supplierPriceListReviewScreen ?? defaultSupplierPriceListReviewScreenServices
      }
    />
  );
}
