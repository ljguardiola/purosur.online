import { Tab, Tabs } from "@purosur/ui";
import { createLink, getRouteApi, Outlet, useMatchRoute } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { ASSEMBLIES_SECTION_TARGETS, type AssembliesSection } from "./assemblies-sections";

const route = getRouteApi("/signed-in/products-area/products/assemblies");

const AssembliesTabLink = createLink(Tab);

const SECTION_LABELS: Record<AssembliesSection, string> = {
  recipes: "Recetas",
  batches: "Tandas",
};

export function AssembliesLayout(): ReactElement {
  const { assembliesSections } = route.useRouteContext();
  const matchRoute = useMatchRoute();
  if (assembliesSections.length < 2) {
    return <Outlet />;
  }
  const selected: AssembliesSection = matchRoute({ to: "/products/assemblies/batches" })
    ? "batches"
    : "recipes";

  return (
    <Tabs
      label="Secciones de Armados"
      selectedTab={selected}
      tabs={assembliesSections.map((key) => (
        <AssembliesTabLink
          key={key}
          to={ASSEMBLIES_SECTION_TARGETS[key]}
          search={key === selected ? true : {}}
          value={key}
          label={SECTION_LABELS[key]}
        />
      ))}
    >
      <Outlet />
    </Tabs>
  );
}
