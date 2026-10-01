import { describe, expect, it } from "vitest";
import { findEmailHolder } from "./find-email-holder.js";
import { user } from "./test-support/branch-user-fixtures.js";
import { FakeBranchUsers } from "./test-support/fake-branch-users.js";

describe("findEmailHolder", () => {
  it("names the user holding the email with their branch and whether they are active", async () => {
    const users = new FakeBranchUsers();
    users.seedUser(
      user({ id: "u-1", email: "ana@example.test", active: false, locationId: "branch-2" }),
    );

    const holder = await findEmailHolder({ users }, { email: "ana@example.test" });

    expect(holder).toEqual({
      id: "u-1",
      firstName: "Ana",
      active: false,
      locationId: "branch-2",
    });
  });

  it("finds nobody when no user holds the email", async () => {
    const holder = await findEmailHolder(
      { users: new FakeBranchUsers() },
      { email: "x@example.test" },
    );

    expect(holder).toBeUndefined();
  });
});
