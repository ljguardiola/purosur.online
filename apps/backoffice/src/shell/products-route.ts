import { createRoute, redirect } from "@tanstack/react-router";
import { canSeeProductsPage } from "./backoffice-access";
import { lazyScreen } from "./lazy-screen";
import { productsAreaRoute } from "./products-area";
import { PRODUCTS_TAB_TARGETS, PRODUCTS_TABS, type ProductsTab } from "./products-tabs";
import { refuseWithout } from "./signed-in-route";

export const productsRoute = createRoute({
  getParentRoute: () => productsAreaRoute,
  path: "products",
  beforeLoad: ({ context: { session } }) => {
    refuseWithout(session, canSeeProductsPage);
    return {
      productsTabs: PRODUCTS_TABS.filter((tab) => tab.isVisibleTo(session)).map((tab) => tab.key),
    };
  },
  component: lazyScreen(() => import("./products-page"), "ProductsPage"),
});

export function productsTabRedirect(productsTabs: readonly ProductsTab[], own: ProductsTab): void {
  const [first] = productsTabs;
  if (productsTabs.includes(own)) {
    return;
  }
  throw redirect(
    first === undefined
      ? { to: "/", search: { account: "credentials" } }
      : { to: PRODUCTS_TAB_TARGETS[first] },
  );
}
