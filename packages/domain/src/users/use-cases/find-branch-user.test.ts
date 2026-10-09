import { describe, expect, it } from "vitest";
import { findBranchUser } from "./find-branch-user.js";
import { administrator, BRANCH, user } from "./test-support/branch-user-fixtures.js";
import { FakeBranchUsers } from "./test-support/fake-branch-users.js";

describe("findBranchUser", () => {
  it("finds an active user of the branch", async () => {
    const users = new FakeBranchUsers();
    users.seedUser(user({ id: "u-1" }));

    const found = await findBranchUser({ users }, { locationId: BRANCH, userId: "u-1" });

    expect(found).toMatchObject({ id: "u-1", isLastActiveAdministrator: false });
  });

  it("finds nobody for a deactivated user unless the scope asks for them", async () => {
    const users = new FakeBranchUsers();
    users.seedUser(user({ id: "u-1", active: false }));
    const input = { locationId: BRANCH, userId: "u-1" };

    expect(await findBranchUser({ users }, input)).toBeUndefined();
    expect(await findBranchUser({ users }, { ...input, activeScope: "inactive" })).toMatchObject({
      id: "u-1",
    });
    expect(await findBranchUser({ users }, { ...input, activeScope: "any" })).toMatchObject({
      id: "u-1",
    });
  });

  it("finds nobody for another branch's user", async () => {
    const users = new FakeBranchUsers();
    users.seedUser(user({ id: "u-1", locationId: "branch-2" }));

    expect(await findBranchUser({ users }, { locationId: BRANCH, userId: "u-1" })).toBeUndefined();
  });

  it("flags the only active administrator as the last one", async () => {
    const users = new FakeBranchUsers();
    users.seedUser(administrator({ id: "u-1" }));

    const found = await findBranchUser({ users }, { locationId: BRANCH, userId: "u-1" });

    expect(found?.isLastActiveAdministrator).toBe(true);
  });

  it("does not flag an administrator while another active one exists", async () => {
    const users = new FakeBranchUsers();
    users.seedUser(administrator({ id: "u-1" }));
    users.seedUser(administrator({ id: "u-2" }));

    const found = await findBranchUser({ users }, { locationId: BRANCH, userId: "u-1" });

    expect(found?.isLastActiveAdministrator).toBe(false);
  });
});
