import { Tab, Tabs } from "@purosur/ui";
import { createLink, getRouteApi, Outlet, useMatchRoute } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { AreaTopBar } from "./area-top-bar";
import { useDocumentTitle } from "./document-title";
import { PRODUCTS_TAB_TARGETS, type ProductsTab } from "./products-tabs";
import { ScreenLayout } from "./screen-layout";

const route = getRouteApi("/signed-in/products-area/products");

const ProductsTabLink = createLink(Tab);

const TAB_LABELS: Record<ProductsTab, string> = {
  products: "Productos",
  prices: "Precios",
  promotions: "Promociones",
  assemblies: "Armados",
  classification: "Clasificación",
};

export function ProductsPage(): ReactElement {
  const { productsTabs } = route.useRouteContext();
  const matchRoute = useMatchRoute();
  useDocumentTitle("Productos · Puro Sur");
  const selectedTab: ProductsTab = matchRoute({ to: "/products/prices" })
    ? "prices"
    : matchRoute({ to: "/products/promotions" })
      ? "promotions"
      : matchRoute({ to: "/products/assemblies", fuzzy: true })
        ? "assemblies"
        : matchRoute({ to: "/products/classification", fuzzy: true })
          ? "classification"
          : "products";

  return (
    <ScreenLayout topBar={<AreaTopBar eyebrow="Catálogo" title="Productos" />} bodyClassName="p-0">
      <Tabs
        label="Secciones de Productos"
        selectedTab={selectedTab}
        tabs={productsTabs.map((key) => (
          <ProductsTabLink
            key={key}
            to={PRODUCTS_TAB_TARGETS[key]}
            search={key === selectedTab ? true : {}}
            value={key}
            label={TAB_LABELS[key]}
          />
        ))}
      >
        <Outlet />
      </Tabs>
    </ScreenLayout>
  );
}
