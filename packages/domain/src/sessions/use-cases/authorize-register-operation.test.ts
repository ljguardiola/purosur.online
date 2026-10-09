import { describe, expect, it } from "vitest";
import type { RegisterOperation } from "../../register/index.js";
import { authorizeRegisterOperation } from "./authorize-register-operation.js";
import { pinCheckFixture } from "./test-support/fake-pin-sign-in-store.js";

const NOW = new Date("2026-09-29T12:00:00.000Z");
const OPERATION: RegisterOperation = {
  kind: "close_locked_register",
  session: { openedBy: "person-2" },
};

function fixture(permissionKeys: string[] = ["close_anothers_register_session"]) {
  const created = pinCheckFixture(NOW);
  created.store.seedHolder("person-1", {
    firstName: "Ana",
    access: { isAdministrator: false, permissionKeys },
    credential: "123456",
  });
  return created;
}

function authorize(created: ReturnType<typeof fixture>, pin: string, userId = "person-1") {
  return authorizeRegisterOperation(created.ports, { userId, pin, operation: OPERATION });
}

describe("authorizeRegisterOperation", () => {
  it("authorizes with the right PIN of a person who may authorize the operation", async () => {
    const created = fixture();

    expect(await authorize(created, "123456")).toEqual({
      kind: "authorized",
      by: { userId: "person-1", firstName: "Ana" },
    });
  });

  it("refuses an unknown person as a wrong PIN, without counting or matching", async () => {
    const created = fixture();

    expect(await authorize(created, "123456", "nobody")).toEqual({
      kind: "wrong_pin",
      retryAfterSeconds: 0,
      attemptsLeft: 7,
    });
    expect(created.store.failures.size).toBe(0);
    expect(created.matching.matched).toEqual([]);
  });

  it("refuses a person who may not authorize the operation before counting or matching", async () => {
    const created = fixture([]);

    expect(await authorize(created, "123456")).toEqual({ kind: "lacks_permission" });
    expect(created.store.failures.size).toBe(0);
    expect(created.matching.matched).toEqual([]);
  });

  it("refuses the person who opened the locked register", async () => {
    const created = fixture();
    created.store.seedHolder("person-2", {
      firstName: "Beto",
      access: { isAdministrator: true, permissionKeys: [] },
      credential: "654321",
    });

    expect(await authorize(created, "654321", "person-2")).toEqual({ kind: "lacks_permission" });
  });

  it("counts a wrong PIN and returns the refusal", async () => {
    const created = fixture();

    expect(await authorize(created, "000000")).toEqual({
      kind: "wrong_pin",
      retryAfterSeconds: 0,
      attemptsLeft: 7,
    });
    expect(created.store.failures.get("person-1")?.consecutiveFailures).toBe(1);
  });

  it("returns unavailable when the PIN cannot be checked", async () => {
    const created = fixture();
    created.matching.unavailable = true;

    expect(await authorize(created, "123456")).toEqual({ kind: "unavailable" });
  });
});
