import { describe, expect, it } from "vitest";
import type { BranchUserActiveScope } from "./branch-users.js";
import { listBranchUsers } from "./list-branch-users.js";
import { administrator, BRANCH, user } from "./test-support/branch-user-fixtures.js";
import { FakeBranchUsers } from "./test-support/fake-branch-users.js";

function listIn(users: FakeBranchUsers, activeScope?: BranchUserActiveScope) {
  return listBranchUsers(
    { users },
    { locationId: BRANCH, ...(activeScope ? { activeScope } : {}) },
  );
}

describe("listBranchUsers", () => {
  it("lists only active users of the branch by default, ordered by first name", async () => {
    const users = new FakeBranchUsers();
    users.seedUser(user({ id: "u-2", firstName: "Zoe" }));
    users.seedUser(user({ id: "u-1", firstName: "Ana" }));
    users.seedUser(user({ id: "u-3", firstName: "Beto", active: false }));
    users.seedUser(user({ id: "u-4", firstName: "Carla", locationId: "branch-2" }));

    const listed = await listIn(users);

    expect(listed.map((entry) => entry.id)).toEqual(["u-1", "u-2"]);
  });

  it("includes deactivated users when asked for any scope", async () => {
    const users = new FakeBranchUsers();
    users.seedUser(user({ id: "u-1", firstName: "Ana" }));
    users.seedUser(user({ id: "u-2", firstName: "Beto", active: false }));

    expect((await listIn(users, "any")).map((entry) => entry.id)).toEqual(["u-1", "u-2"]);
    expect((await listIn(users, "inactive")).map((entry) => entry.id)).toEqual(["u-2"]);
  });

  it("flags the only active administrator as the last one", async () => {
    const users = new FakeBranchUsers();
    users.seedUser(administrator({ id: "u-1", firstName: "Ana" }));
    users.seedUser(user({ id: "u-2", firstName: "Beto" }));

    const listed = await listIn(users);

    expect(listed.map((entry) => entry.isLastActiveAdministrator)).toEqual([true, false]);
  });

  it("flags no administrator while another active one exists", async () => {
    const users = new FakeBranchUsers();
    users.seedUser(administrator({ id: "u-1", firstName: "Ana" }));
    users.seedUser(administrator({ id: "u-2", firstName: "Beto" }));

    const listed = await listIn(users);

    expect(listed.map((entry) => entry.isLastActiveAdministrator)).toEqual([false, false]);
  });

  it("does not count a deactivated administrator as another active one", async () => {
    const users = new FakeBranchUsers();
    users.seedUser(administrator({ id: "u-1", firstName: "Ana" }));
    users.seedUser(administrator({ id: "u-2", firstName: "Beto", active: false }));

    const listed = await listIn(users);

    expect(listed.map((entry) => entry.isLastActiveAdministrator)).toEqual([true]);
  });

  it("keeps every fact the store gave about each user", async () => {
    const users = new FakeBranchUsers();
    users.seedUser(user({ id: "u-1", passkeyCount: 2, version: 5 }));

    const [listed] = await listIn(users);

    expect(listed).toEqual({
      id: "u-1",
      firstName: "Ana",
      email: "u-1@example.test",
      version: 5,
      active: true,
      roleId: "role-cashier",
      roleName: "Cajero",
      roleIsAdministrator: false,
      passkeyCount: 2,
      isLastActiveAdministrator: false,
    });
  });
});
