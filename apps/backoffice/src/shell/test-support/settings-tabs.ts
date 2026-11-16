import { visibleAreaTabs } from "../area-tabs";
import { SETTINGS_TABS } from "../settings-tabs";
import { accessWith } from "./backoffice-access";

export const settingsTabs = visibleAreaTabs(
  SETTINGS_TABS,
  accessWith("branch_area", "quarantined_events", "reports_area"),
);
