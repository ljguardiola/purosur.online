import { describe, expect, it } from "vitest";
import { listOwnPasskeys } from "./list-own-passkeys.js";
import { FakePasskeys } from "./test-support/fake-passkeys.js";

function passkey(id: string, userId: string, createdAt: string, lastUsedAt: string | null = null) {
  return {
    id,
    userId,
    name: `Llave `,
    createdAt: new Date(createdAt),
    lastUsedAt: lastUsedAt === null ? null : new Date(lastUsedAt),
  };
}

describe("listOwnPasskeys", () => {
  it("lists the passkeys of the user from the oldest, with when each was last used", async () => {
    const passkeys = new FakePasskeys();
    passkeys.seedPasskey(passkey("p-2", "u-1", "2026-10-02T08:00:00.000Z"));
    passkeys.seedPasskey(
      passkey("p-1", "u-1", "2026-10-01T08:00:00.000Z", "2026-10-03T08:00:00.000Z"),
    );

    const listed = await listOwnPasskeys({ passkeys }, { userId: "u-1" });

    expect(listed).toEqual([
      {
        id: "p-1",
        name: "Llave p-1",
        createdAt: new Date("2026-10-01T08:00:00.000Z"),
        lastUsedAt: new Date("2026-10-03T08:00:00.000Z"),
      },
      {
        id: "p-2",
        name: "Llave p-2",
        createdAt: new Date("2026-10-02T08:00:00.000Z"),
        lastUsedAt: null,
      },
    ]);
  });

  it("leaves out the passkeys of other users", async () => {
    const passkeys = new FakePasskeys();
    passkeys.seedPasskey(passkey("p-1", "u-2", "2026-10-01T08:00:00.000Z"));

    expect(await listOwnPasskeys({ passkeys }, { userId: "u-1" })).toEqual([]);
  });
});
