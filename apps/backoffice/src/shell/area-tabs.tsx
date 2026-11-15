import { Tab, Tabs } from "@purosur/ui";
import { createLink, type LinkProps } from "@tanstack/react-router";
import type { ReactNode } from "react";
import type { PagePart } from "../platform/page-parts";
import type { BackofficeAccess } from "./backoffice-access";

const AreaTabLink = createLink(Tab);

export type AreaTabTarget = NonNullable<LinkProps["to"]>;

export type AreaTab<Key extends string = string> = {
  key: Key;
  label: string;
  to: AreaTabTarget;
};

export type AreaTabPart<Key extends string> = PagePart<BackofficeAccess, Key> & AreaTab<Key>;

export function visibleAreaTabs<Key extends string>(
  parts: readonly AreaTabPart<Key>[],
  access: BackofficeAccess,
): AreaTab<Key>[] {
  return parts
    .filter((part) => part.isVisibleTo(access))
    .map(({ key, label, to }) => ({ key, label, to }));
}

export type AreaTabsProps = {
  area: string;
  tabs: readonly AreaTab[];
  selected: string;
  children: ReactNode;
};

export function AreaTabs({ area, tabs, selected, children }: AreaTabsProps) {
  return (
    <Tabs
      label={`Secciones de ${area}`}
      selectedTab={selected}
      tabs={tabs.map(({ key, label, to }) => (
        <AreaTabLink
          key={key}
          to={to}
          search={key === selected ? true : {}}
          value={key}
          label={label}
        />
      ))}
    >
      {children}
    </Tabs>
  );
}
