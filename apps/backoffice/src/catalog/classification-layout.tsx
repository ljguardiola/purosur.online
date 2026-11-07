import { Tab, Tabs } from "@purosur/ui";
import { createLink, Outlet, useMatchRoute } from "@tanstack/react-router";
import type { ReactElement } from "react";

const ClassificationTabLink = createLink(Tab);

const SECTIONS = [
  { key: "categories", label: "Categorías", to: "/products/classification" },
  { key: "brands", label: "Marcas", to: "/products/classification/brands" },
  { key: "tags", label: "Distintivos", to: "/products/classification/tags" },
] as const;

export function ClassificationLayout(): ReactElement {
  const matchRoute = useMatchRoute();
  const selected = matchRoute({ to: "/products/classification/brands" })
    ? "brands"
    : matchRoute({ to: "/products/classification/tags" })
      ? "tags"
      : "categories";

  return (
    <Tabs
      label="Secciones de Clasificación"
      selectedTab={selected}
      tabs={SECTIONS.map(({ key, label, to }) => (
        <ClassificationTabLink
          key={key}
          to={to}
          search={key === selected ? true : {}}
          value={key}
          label={label}
        />
      ))}
    >
      <Outlet />
    </Tabs>
  );
}
