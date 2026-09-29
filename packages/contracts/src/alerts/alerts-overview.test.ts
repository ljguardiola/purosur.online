import { describe, expect, it } from "vitest";
import { alertsOverviewSchema } from "./alerts-overview.js";

const overview = {
  critical: { openCount: 2, kinds: ["user_access_increased"] },
  warning: { openCount: 3, kinds: ["backoffice_passkey_changed", "user_email_changed"] },
  informational: { openCount: 0, kinds: [] },
};

describe("alertsOverviewSchema", () => {
  it("accepts each level's open count and the kinds open at that level", () => {
    expect(alertsOverviewSchema.safeParse(overview).data).toEqual(overview);
  });

  it("accepts a kind the catalog does not list, such as one a later release adds", () => {
    const withNewKind = { ...overview, informational: { openCount: 1, kinds: ["kind_a"] } };

    expect(alertsOverviewSchema.safeParse(withNewKind).data).toEqual(withNewKind);
  });

  it("strips keys it does not define, also inside a level", () => {
    expect(
      alertsOverviewSchema.safeParse({
        ...overview,
        total: 5,
        critical: { ...overview.critical, audience: "all" },
      }).data,
    ).toEqual(overview);
  });

  it.each(["critical", "warning", "informational"])("requires the level %s", (level) => {
    const { [level as keyof typeof overview]: _omitted, ...rest } = overview;

    expect(alertsOverviewSchema.safeParse(rest).success).toBe(false);
  });

  it.each(["openCount", "kinds"])("requires a level's %s", (field) => {
    const { [field as keyof typeof overview.critical]: _omitted, ...critical } = overview.critical;

    expect(alertsOverviewSchema.safeParse({ ...overview, critical }).success).toBe(false);
  });

  it.each([
    ["openCount", -1],
    ["openCount", 1.5],
    ["openCount", "2"],
    ["kinds", null],
    ["kinds", "user_access_increased"],
    ["kinds", [1]],
  ])("refuses a level's %s as %j", (field, value) => {
    expect(
      alertsOverviewSchema.safeParse({
        ...overview,
        critical: { ...overview.critical, [field]: value },
      }).success,
    ).toBe(false);
  });
});
