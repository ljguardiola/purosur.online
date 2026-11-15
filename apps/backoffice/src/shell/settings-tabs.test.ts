import { expect, test } from "vitest";
import { visibleAreaTabs } from "./area-tabs";
import { SETTINGS_TABS } from "./settings-tabs";
import { accessWith } from "./test-support/backoffice-access";

function visibleTabs(...capabilities: Parameters<typeof accessWith>) {
  return visibleAreaTabs(SETTINGS_TABS, accessWith(...capabilities)).map((tab) => tab.key);
}

test("shows every tab, in order, to a person with every settings capability", () => {
  expect(
    visibleTabs("users_area", "manage_roles", "branch_area", "quarantined_events", "reports_area"),
  ).toEqual(["users", "roles", "branch", "held-register-changes", "ai-cost"]);
});

test.each([
  ["users_area", "users"],
  ["manage_roles", "roles"],
  ["branch_area", "branch"],
  ["quarantined_events", "held-register-changes"],
] as const)("shows only its own tab with only %s", (capability, tab) => {
  expect(visibleTabs(capability)).toEqual([tab]);
});

test("shows Costo de IA only to a person who sees both the reports and the branch", () => {
  expect(visibleTabs("reports_area")).toEqual([]);
  expect(visibleTabs("reports_area", "branch_area")).toEqual(["branch", "ai-cost"]);
});

test("labels each tab and gives it its own address", () => {
  expect(SETTINGS_TABS.map(({ key, label, to }) => ({ key, label, to }))).toEqual([
    { key: "users", label: "Usuarios", to: "/people/users" },
    { key: "roles", label: "Roles", to: "/people/roles" },
    { key: "branch", label: "Sucursal", to: "/branch" },
    {
      key: "held-register-changes",
      label: "Cambios de cajas retenidos",
      to: "/held-register-changes",
    },
    { key: "ai-cost", label: "Costo de IA", to: "/ai-cost" },
  ]);
});
