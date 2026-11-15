import type { ReactNode } from "react";
import { type AreaTab, AreaTabs } from "./area-tabs";
import { AreaTopBar } from "./area-top-bar";
import { ScreenLayout } from "./screen-layout";
import type { SettingsTab } from "./settings-tabs";

export type SettingsFrameProps = {
  tabs: readonly AreaTab<SettingsTab>[];
  selected: SettingsTab;
  action?: ReactNode;
  children: ReactNode;
};

export function SettingsFrame({ tabs, selected, action, children }: SettingsFrameProps) {
  return (
    <ScreenLayout topBar={<AreaTopBar title="Configuración" action={action} />} bodyClassName="p-0">
      <AreaTabs area="Configuración" tabs={tabs} selected={selected}>
        <div className="relative flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-6">
          {children}
        </div>
      </AreaTabs>
    </ScreenLayout>
  );
}
