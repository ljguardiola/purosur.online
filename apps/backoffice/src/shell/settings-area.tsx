import { createRoute, Outlet } from "@tanstack/react-router";
import { AreaLayout } from "./area-layout";
import { visibleAreaTabs } from "./area-tabs";
import { SETTINGS_TABS } from "./settings-tabs";
import { signedInRoute } from "./signed-in-route";

export const settingsAreaRoute = createRoute({
  getParentRoute: () => signedInRoute,
  id: "settings-area",
  beforeLoad: ({ context: { session } }) => ({
    settingsTabs: visibleAreaTabs(SETTINGS_TABS, session),
  }),
  component: SettingsArea,
});

function SettingsArea() {
  return (
    <AreaLayout area="settings">
      <Outlet />
    </AreaLayout>
  );
}
