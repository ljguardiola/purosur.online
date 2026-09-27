import { createRoute } from "@tanstack/react-router";
import { canManageProductsAndCategories } from "../access/backoffice-access";
import { catalogAreaRoute } from "../shell/catalog-area";
import { useDocumentTitle } from "../shell/document-title";
import { refuseWithout } from "../shell/signed-in-route";
import { CategoriesListScreen } from "./categories-list-screen";
import { ProductsListScreen } from "./products-list-screen";

export const productsListRoute = createRoute({
  getParentRoute: () => catalogAreaRoute,
  path: "products",
  beforeLoad: ({ context: { session } }) => refuseWithout(session, canManageProductsAndCategories),
  component: ProductsListPage,
});

function ProductsListPage() {
  const { services, sessionActions } = productsListRoute.useRouteContext();
  useDocumentTitle("Productos · Puro Sur");
  return (
    <ProductsListScreen
      onSessionEnded={sessionActions.sessionEnded}
      services={services.productsListScreen}
    />
  );
}

export const categoriesListRoute = createRoute({
  getParentRoute: () => catalogAreaRoute,
  path: "categories",
  beforeLoad: ({ context: { session } }) => refuseWithout(session, canManageProductsAndCategories),
  component: CategoriesListPage,
});

function CategoriesListPage() {
  const { services, sessionActions } = categoriesListRoute.useRouteContext();
  useDocumentTitle("Categorías · Puro Sur");
  return (
    <CategoriesListScreen
      onSessionEnded={sessionActions.sessionEnded}
      services={services.categoriesListScreen}
    />
  );
}
