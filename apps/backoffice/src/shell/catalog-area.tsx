import { createRoute, Outlet, redirect, useMatchRoute } from "@tanstack/react-router";
import { ListChecks, Package, Tags } from "lucide-react";
import { canManageProductsAndCategories, canSeePricesArea } from "../access/backoffice-access";
import { AreaLayout, SectionLink } from "./area-layout";
import { signedInRoute } from "./signed-in-route";

export const catalogAreaRoute = createRoute({
  getParentRoute: () => signedInRoute,
  path: "catalog",
  component: CatalogArea,
});

export const catalogAreaIndexRoute = createRoute({
  getParentRoute: () => catalogAreaRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/help" });
  },
});

function CatalogArea() {
  const { session } = catalogAreaRoute.useRouteContext();
  const matchRoute = useMatchRoute();
  const productsShown = Boolean(matchRoute({ to: "/catalog/products" }));
  const categoriesShown = Boolean(matchRoute({ to: "/catalog/categories" }));
  const pricesShown = Boolean(matchRoute({ to: "/catalog/prices" }));
  return (
    <AreaLayout
      area="catalog"
      sectionColumnLabel="Catálogo"
      sectionColumn={
        <>
          <h2 className="text-text-accent text-heading">Catálogo</h2>
          <div className="h-2.5" />
          <ul className="flex flex-col gap-1">
            {canManageProductsAndCategories(session) && (
              <>
                <li>
                  <SectionLink
                    to="/catalog/products"
                    label="Productos"
                    icon={<Package />}
                    search={productsShown ? true : {}}
                    active={productsShown}
                  />
                </li>
                <li>
                  <SectionLink
                    to="/catalog/categories"
                    label="Categorías"
                    icon={<Tags />}
                    search={categoriesShown ? true : {}}
                    active={categoriesShown}
                  />
                </li>
              </>
            )}
            {canSeePricesArea(session) && (
              <li>
                <SectionLink
                  to="/catalog/prices"
                  label="Precios"
                  icon={<ListChecks />}
                  search={pricesShown ? true : {}}
                  active={pricesShown}
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
