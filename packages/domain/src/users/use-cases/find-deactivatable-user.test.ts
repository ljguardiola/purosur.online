import { describe, expect, it } from "vitest";
import { findDeactivatableUser } from "./find-deactivatable-user.js";
import { administrator, BRANCH, user } from "./test-support/branch-user-fixtures.js";
import { FakeBranchUsers } from "./test-support/fake-branch-users.js";

function find(seed: Parameters<FakeBranchUsers["seedUser"]>[0][], userId: string) {
  const users = new FakeBranchUsers();
  for (const seeded of seed) {
    users.seedUser(seeded);
  }
  return findDeactivatableUser({ users }, { locationId: BRANCH, userId, actorId: "u-actor" });
}

describe("findDeactivatableUser", () => {
  it("finds an active user of the branch who is neither an administrator nor the actor", async () => {
    const found = await find([user({ id: "u-1", firstName: "Ana" })], "u-1");

    expect(found).toMatchObject({ id: "u-1", firstName: "Ana" });
  });

  it("finds nobody when the user is an administrator", async () => {
    expect(await find([administrator({ id: "u-1" })], "u-1")).toBeUndefined();
  });

  it("finds nobody when the user is the actor", async () => {
    expect(await find([user({ id: "u-actor" })], "u-actor")).toBeUndefined();
  });

  it("finds nobody when the user is already deactivated", async () => {
    expect(await find([user({ id: "u-1", active: false })], "u-1")).toBeUndefined();
  });

  it("finds nobody when the user belongs to another branch", async () => {
    expect(await find([user({ id: "u-1", locationId: "branch-2" })], "u-1")).toBeUndefined();
  });

  it("finds nobody when there is no such user", async () => {
    expect(await find([], "u-1")).toBeUndefined();
  });
});
