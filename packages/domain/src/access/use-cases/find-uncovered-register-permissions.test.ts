import { describe, expect, it } from "vitest";
import { findUncoveredRegisterPermissions } from "./find-uncovered-register-permissions.js";
import { administrator, BRANCH, user } from "./test-support/branch-user-fixtures.js";
import { FakeBranchUsers } from "./test-support/fake-branch-users.js";

describe("findUncoveredRegisterPermissions", () => {
  it("lists every register permission when nobody holds one", async () => {
    const users = new FakeBranchUsers();

    const uncovered = await findUncoveredRegisterPermissions({ users }, { locationId: BRANCH });

    expect(uncovered).toContain("sell_and_charge");
    expect(uncovered).toContain("view_sales_history");
  });

  it("leaves out the permissions an active user of the branch holds", async () => {
    const users = new FakeBranchUsers();
    users.seedUser(user({ id: "u-1", permissionKeys: ["sell_and_charge"] }));

    const uncovered = await findUncoveredRegisterPermissions({ users }, { locationId: BRANCH });

    expect(uncovered).not.toContain("sell_and_charge");
    expect(uncovered).toContain("view_sales_history");
  });

  it("does not count a deactivated user or another branch's user", async () => {
    const users = new FakeBranchUsers();
    users.seedUser(user({ id: "u-1", active: false, permissionKeys: ["sell_and_charge"] }));
    users.seedUser(
      user({ id: "u-2", locationId: "branch-2", permissionKeys: ["view_sales_history"] }),
    );

    const uncovered = await findUncoveredRegisterPermissions({ users }, { locationId: BRANCH });

    expect(uncovered).toContain("sell_and_charge");
    expect(uncovered).toContain("view_sales_history");
  });

  it("does not let an administrator cover a permission its role does not list", async () => {
    const users = new FakeBranchUsers();
    users.seedUser(administrator({ id: "u-1" }));

    const uncovered = await findUncoveredRegisterPermissions({ users }, { locationId: BRANCH });

    expect(uncovered).toContain("sell_and_charge");
  });
});
