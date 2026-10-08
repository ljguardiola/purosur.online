import { describe, expect, it } from "vitest";
import { listUserPasskeys } from "./list-user-passkeys.js";
import { FakePasskeyHolders } from "./test-support/fake-passkey-holders.js";
import { FakePasskeys } from "./test-support/fake-passkeys.js";

const BRANCH = "branch-1";

const CREATED_AT = new Date("2026-10-01T08:00:00.000Z");

function ports() {
  const holders = new FakePasskeyHolders();
  const passkeys = new FakePasskeys();
  passkeys.seedPasskey({
    id: "p-1",
    userId: "u-1",
    name: "Llave",
    createdAt: CREATED_AT,
    lastUsedAt: null,
  });
  return { holders, passkeys };
}

describe("listUserPasskeys", () => {
  it("lists the passkeys of a user of the branch", async () => {
    const { holders, passkeys } = ports();
    holders.seedHolder({ id: "u-1", locationId: BRANCH, active: true });

    const outcome = await listUserPasskeys(
      { holders, passkeys },
      { locationId: BRANCH, userId: "u-1", activeScope: "active" },
    );

    expect(outcome).toEqual({
      kind: "listed",
      passkeys: [{ id: "p-1", name: "Llave", createdAt: CREATED_AT, lastUsedAt: null }],
    });
  });

  it("finds no user in another branch", async () => {
    const { holders, passkeys } = ports();
    holders.seedHolder({ id: "u-1", locationId: "branch-2", active: true });

    const outcome = await listUserPasskeys(
      { holders, passkeys },
      { locationId: BRANCH, userId: "u-1", activeScope: "any" },
    );

    expect(outcome).toEqual({ kind: "not_found" });
  });

  it("finds an inactive user only when the scope asks for any", async () => {
    const { holders, passkeys } = ports();
    holders.seedHolder({ id: "u-1", locationId: BRANCH, active: false });
    const input = { locationId: BRANCH, userId: "u-1" };

    expect(
      await listUserPasskeys({ holders, passkeys }, { ...input, activeScope: "active" }),
    ).toEqual({ kind: "not_found" });
    expect(
      (await listUserPasskeys({ holders, passkeys }, { ...input, activeScope: "any" })).kind,
    ).toBe("listed");
  });
});
