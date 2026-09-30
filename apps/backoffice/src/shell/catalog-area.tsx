import { createRoute, Outlet, useMatchRoute } from "@tanstack/react-router";
import { BadgePercent, Factory, ListChecks, Package, Sparkles, Tags } from "lucide-react";
import {
  canManageProductsAndCategories,
  canManagePromotions,
  canSeePricesArea,
} from "../access/backoffice-access";
import { AreaLayout, SectionLink } from "./area-layout";
import { signedInRoute } from "./signed-in-route";

export const catalogAreaRoute = createRoute({
  getParentRoute: () => signedInRoute,
  id: "catalog-area",
  component: CatalogArea,
});

function CatalogArea() {
  const { session } = catalogAreaRoute.useRouteContext();
  const matchRoute = useMatchRoute();
  const productsShown = Boolean(matchRoute({ to: "/products" }));
  const categoriesShown = Boolean(matchRoute({ to: "/categories" }));
  const brandsShown = Boolean(matchRoute({ to: "/brands" }));
  const tagsShown = Boolean(matchRoute({ to: "/tags" }));
  const pricesShown = Boolean(matchRoute({ to: "/prices" }));
  const discountsShown = Boolean(matchRoute({ to: "/discounts" }));
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
                    to="/products"
                    label="Productos"
                    icon={<Package />}
                    search={productsShown ? true : {}}
                    active={productsShown}
                  />
                </li>
                <li>
                  <SectionLink
                    to="/categories"
                    label="Categorías"
                    icon={<Tags />}
                    search={categoriesShown ? true : {}}
                    active={categoriesShown}
                  />
                </li>
                <li>
                  <SectionLink
                    to="/brands"
                    label="Marcas"
                    icon={<Factory />}
                    search={brandsShown ? true : {}}
                    active={brandsShown}
                  />
                </li>
                <li>
                  <SectionLink
                    to="/tags"
                    label="Distintivos"
                    icon={<Sparkles />}
                    search={tagsShown ? true : {}}
                    active={tagsShown}
                  />
                </li>
              </>
            )}
            {canSeePricesArea(session) && (
              <li>
                <SectionLink
                  to="/prices"
                  label="Precios"
                  icon={<ListChecks />}
                  search={pricesShown ? true : {}}
                  active={pricesShown}
                />
              </li>
            )}
            {canManagePromotions(session) && (
              <li>
                <SectionLink
                  to="/discounts"
                  label="Promociones"
                  icon={<BadgePercent />}
                  search={discountsShown ? true : {}}
                  active={discountsShown}
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
