import type { ReactNode } from "react";
import { type AreaTab, AreaTabs } from "../shell/area-tabs";
import type { PurchasingTab } from "./purchasing-area-tabs";

export type PurchasingTabsProps = {
  tabs: readonly AreaTab<PurchasingTab>[];
  selected: PurchasingTab;
  children: ReactNode;
};

export function PurchasingTabs({ tabs, selected, children }: PurchasingTabsProps) {
  return (
    <AreaTabs area="Compras" tabs={tabs} selected={selected}>
      {children}
    </AreaTabs>
  );
}
