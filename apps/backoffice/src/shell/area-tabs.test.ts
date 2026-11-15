import { expect, test } from "vitest";
import { type AreaTabPart, visibleAreaTabs } from "./area-tabs";
import { canSeeReports, canSeeUsersArea } from "./backoffice-access";
import { accessWith } from "./test-support/backoffice-access";

const PARTS: readonly AreaTabPart<"users" | "reports">[] = [
  { key: "users", label: "Usuarios", to: "/people/users", isVisibleTo: canSeeUsersArea },
  { key: "reports", label: "Reportes", to: "/reports", isVisibleTo: canSeeReports },
];

test("keeps every tab the access sees, in order, as its key, label and address alone", () => {
  expect(visibleAreaTabs(PARTS, accessWith("users_area", "reports_area"))).toEqual([
    { key: "users", label: "Usuarios", to: "/people/users" },
    { key: "reports", label: "Reportes", to: "/reports" },
  ]);
});

test("drops the tabs the access does not see", () => {
  expect(visibleAreaTabs(PARTS, accessWith("reports_area"))).toEqual([
    { key: "reports", label: "Reportes", to: "/reports" },
  ]);
});

test("keeps no tab for an access that sees none", () => {
  expect(visibleAreaTabs(PARTS, accessWith("stock_area"))).toEqual([]);
});
