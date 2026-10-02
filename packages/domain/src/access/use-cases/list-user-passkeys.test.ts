import { describe, expect, it } from "vitest";
import { listUserPasskeys } from "./list-user-passkeys.js";
import { BRANCH, user } from "./test-support/branch-user-fixtures.js";
import { FakeBranchUsers } from "./test-support/fake-branch-users.js";
import { FakePasskeys } from "./test-support/fake-passkeys.js";

const CREATED_AT = new Date("2026-10-01T08:00:00.000Z");

function ports() {
  const users = new FakeBranchUsers();
  const passkeys = new FakePasskeys();
  passkeys.seedPasskey({
    id: "p-1",
    userId: "u-1",
    name: "Llave",
    createdAt: CREATED_AT,
    lastUsedAt: null,
  });
  return { users, passkeys };
}

describe("listUserPasskeys", () => {
  it("lists the passkeys of a user of the branch", async () => {
    const { users, passkeys } = ports();
    users.seedUser(user({ id: "u-1" }));

    const outcome = await listUserPasskeys(
      { users, passkeys },
      { locationId: BRANCH, userId: "u-1", activeScope: "active" },
    );

    expect(outcome).toEqual({
      kind: "listed",
      passkeys: [{ id: "p-1", name: "Llave", createdAt: CREATED_AT, lastUsedAt: null }],
    });
  });

  it("finds no user in another branch", async () => {
    const { users, passkeys } = ports();
    users.seedUser(user({ id: "u-1", locationId: "branch-2" }));

    const outcome = await listUserPasskeys(
      { users, passkeys },
      { locationId: BRANCH, userId: "u-1", activeScope: "any" },
    );

    expect(outcome).toEqual({ kind: "not_found" });
  });

  it("finds an inactive user only when the scope asks for any", async () => {
    const { users, passkeys } = ports();
    users.seedUser(user({ id: "u-1", active: false }));
    const input = { locationId: BRANCH, userId: "u-1" };

    expect(
      await listUserPasskeys({ users, passkeys }, { ...input, activeScope: "active" }),
    ).toEqual({ kind: "not_found" });
    expect(
      (await listUserPasskeys({ users, passkeys }, { ...input, activeScope: "any" })).kind,
    ).toBe("listed");
  });
});
