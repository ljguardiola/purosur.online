import { Tab, Tabs } from "@purosur/ui";
import { createLink, useMatchRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import type { AreaTab } from "./area-tabs";

const AreaTabLink = createLink(Tab);

export type AreaTabsProps = {
  area: string;
  tabs: readonly AreaTab[];
  selected: string;
  children: ReactNode;
};

export function AreaTabs({ area, tabs, selected, children }: AreaTabsProps) {
  const matchRoute = useMatchRoute();
  return (
    <Tabs
      label={`Secciones de ${area}`}
      selectedTab={selected}
      tabs={tabs.map(({ key, label, to }) => (
        <AreaTabLink
          key={key}
          to={to}
          search={key === selected && matchRoute({ to }) !== false ? true : {}}
          value={key}
          label={label}
        />
      ))}
    >
      {children}
    </Tabs>
  );
}
