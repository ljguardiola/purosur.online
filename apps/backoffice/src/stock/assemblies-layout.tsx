import { Tab, Tabs } from "@purosur/ui";
import { createLink, getRouteApi, Outlet, useMatchRoute } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { canManageBatches } from "../shell/backoffice-access";

const route = getRouteApi("/signed-in/products-area/products/assemblies");

const AssembliesTabLink = createLink(Tab);

export function AssembliesLayout(): ReactElement {
  const { session } = route.useRouteContext();
  const matchRoute = useMatchRoute();
  if (!canManageBatches(session)) {
    return <Outlet />;
  }
  const selected = matchRoute({ to: "/products/assemblies/batches" }) ? "batches" : "recipes";

  return (
    <Tabs
      label="Secciones de Armados"
      selectedTab={selected}
      tabs={[
        <AssembliesTabLink
          key="recipes"
          to="/products/assemblies"
          search={selected === "recipes" ? true : {}}
          value="recipes"
          label="Recetas"
        />,
        <AssembliesTabLink
          key="batches"
          to="/products/assemblies/batches"
          search={selected === "batches" ? true : {}}
          value="batches"
          label="Tandas"
        />,
      ]}
    >
      <Outlet />
    </Tabs>
  );
}
