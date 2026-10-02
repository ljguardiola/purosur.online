import { describe, expect, it } from "vitest";
import { findPasskeyRemovalTarget } from "./find-passkey-removal-target.js";
import { BRANCH, user } from "./test-support/branch-user-fixtures.js";
import { FakeBranchUsers } from "./test-support/fake-branch-users.js";

const INPUT = { locationId: BRANCH, administratorId: "admin-1", targetUserId: "u-1" };

describe("findPasskeyRemovalTarget", () => {
  it("finds an active user of the branch other than the administrator", async () => {
    const users = new FakeBranchUsers();
    users.seedUser(user({ id: "u-1" }));

    const outcome = await findPasskeyRemovalTarget({ users }, INPUT);

    expect(outcome).toMatchObject({ kind: "found", target: { id: "u-1" } });
  });

  it("refuses the administrator's own account", async () => {
    const users = new FakeBranchUsers();
    users.seedUser(user({ id: "admin-1" }));

    const outcome = await findPasskeyRemovalTarget(
      { users },
      { ...INPUT, targetUserId: "admin-1" },
    );

    expect(outcome).toEqual({ kind: "own_account" });
  });

  it("finds nobody in another branch or among the deactivated", async () => {
    const users = new FakeBranchUsers();
    users.seedUser(user({ id: "u-1", locationId: "branch-2" }));
    users.seedUser(user({ id: "u-2", active: false }));

    expect(await findPasskeyRemovalTarget({ users }, INPUT)).toEqual({ kind: "user_not_found" });
    expect(await findPasskeyRemovalTarget({ users }, { ...INPUT, targetUserId: "u-2" })).toEqual({
      kind: "user_not_found",
    });
  });
});
