import { createRoute, Outlet, useMatchRoute } from "@tanstack/react-router";
import { Package } from "lucide-react";
import { AreaLayout, SectionLink } from "./area-layout";
import { canSeeProductsPage } from "./backoffice-access";
import { signedInRoute } from "./signed-in-route";

export const productsAreaRoute = createRoute({
  getParentRoute: () => signedInRoute,
  id: "products-area",
  component: ProductsArea,
});

function ProductsArea() {
  const { session } = productsAreaRoute.useRouteContext();
  const matchRoute = useMatchRoute();
  const productsShown = Boolean(matchRoute({ to: "/products", fuzzy: true }));
  return (
    <AreaLayout
      area="products"
      sectionColumnLabel="Productos"
      sectionColumn={
        <>
          <h2 className="text-text-accent text-heading">Productos</h2>
          <div className="h-2.5" />
          <ul className="flex flex-col gap-1">
            {canSeeProductsPage(session) && (
              <li>
                <SectionLink
                  to="/products"
                  label="Productos"
                  icon={<Package />}
                  search={productsShown ? true : {}}
                  active={productsShown}
                />
              </li>
            )}
          </ul>
        </>
      }
    >
      <Outlet />
    </AreaLayout>
  );
}
