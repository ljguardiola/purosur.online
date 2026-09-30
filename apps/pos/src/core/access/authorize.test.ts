import { encodePinHash } from "@purosur/domain";
import { describe, expect, expectTypeOf, it } from "vitest";
import { authorize } from "./authorize";
import type { PinCheckDeps } from "./pin-check";
import { derivePinVerifier } from "./pin-verifier";
import { signIn } from "./sign-in";
import type { PinSignInFailures, SignInRecord } from "./sqlite-sign-in-store";

const PEPPER = Buffer.alloc(32, 7).toString("base64url");
const SALT = encodePinHash(new Uint8Array(16).fill(1));
const PIN_HASH = "hash-of-the-right-pin";

function record(overrides: Partial<SignInRecord> = {}): SignInRecord {
  return {
    firstName: "Grace",
    salt: SALT,
    verifier: derivePinVerifier(PEPPER, PIN_HASH),
    access: { isAdministrator: false, permissionKeys: ["record_cash_in"] },
    ...overrides,
  };
}

const NOW = new Date("2026-05-01T10:00:00.000Z");

function failuresAt(consecutiveFailures: number, secondsAgo = 3600): PinSignInFailures {
  return {
    consecutiveFailures,
    lastFailedAt: new Date(NOW.getTime() - secondsAgo * 1000),
  };
}

function deps(
  stored: SignInRecord | undefined = record(),
  overrides: Partial<PinCheckDeps> = {},
  failing: Record<string, PinSignInFailures> = {},
) {
  const hashed: string[] = [];
  const failures = new Map(Object.entries(failing));
  const built: PinCheckDeps = {
    store: {
      signInRecord: (userId) => (userId === "u2" ? stored : undefined),
      pinSignInFailures: (userId) => failures.get(userId),
      recordPinSignInFailure: (userId, at) => {
        const next = {
          consecutiveFailures: (failures.get(userId)?.consecutiveFailures ?? 0) + 1,
          lastFailedAt: at,
        };
        failures.set(userId, next);
        return next;
      },
      withdrawPinSignInFailure: () => {},
      clearPinSignInFailures: (userId) => {
        failures.delete(userId);
      },
    },
    readPepper: async () => PEPPER,
    hashPin: async (pin) => {
      hashed.push(pin);
      return pin === "1234" ? PIN_HASH : "hash-of-another-pin";
    },
    now: () => NOW,
    ...overrides,
  };
  return { built, hashed, failures };
}

describe("authorizing with another person's PIN", () => {
  it("authorizes a person who enters their right PIN and holds the permission", async () => {
    expect(await authorize(deps().built, { user_id: "u2", pin: "1234" }, "record_cash_in")).toEqual(
      { kind: "authorized", by: { user_id: "u2", first_name: "Grace" } },
    );
  });

  it("authorizes an Administrator for any permission", async () => {
    const admin = record({ access: { isAdministrator: true, permissionKeys: [] } });

    expect(
      (await authorize(deps(admin).built, { user_id: "u2", pin: "1234" }, "void_sale")).kind,
    ).toBe("authorized");
  });

  it("refuses a wrong PIN and tells how many attempts are left", async () => {
    expect(await authorize(deps().built, { user_id: "u2", pin: "9999" }, "record_cash_in")).toEqual(
      { kind: "wrong_pin", retry_after_seconds: 0, attempts_left: 7 },
    );
  });

  it("refuses an unknown person as it refuses a wrong PIN, without hashing", async () => {
    const { built, hashed } = deps();

    expect(await authorize(built, { user_id: "nobody", pin: "1234" }, "record_cash_in")).toEqual({
      kind: "wrong_pin",
      retry_after_seconds: 0,
      attempts_left: 7,
    });
    expect(hashed).toEqual([]);
  });

  it("refuses a right PIN whose person lacks the permission", async () => {
    expect(await authorize(deps().built, { user_id: "u2", pin: "1234" }, "void_sale")).toEqual({
      kind: "lacks_permission",
    });
  });

  it("tells a missing permission before it checks the PIN, without hashing", async () => {
    const { built, hashed } = deps();

    expect(await authorize(built, { user_id: "u2", pin: "9999" }, "void_sale")).toEqual({
      kind: "lacks_permission",
    });
    expect(hashed).toEqual([]);
  });

  it("refuses a person whose salt cannot be read as it refuses a wrong PIN, without hashing", async () => {
    const { built, hashed } = deps(record({ salt: "not-a-salt" }));

    expect(await authorize(built, { user_id: "u2", pin: "1234" }, "void_sale")).toEqual({
      kind: "wrong_pin",
      retry_after_seconds: 0,
      attempts_left: 7,
    });
    expect(hashed).toEqual([]);
  });

  it("is unavailable when the register has no pepper", async () => {
    const { built } = deps(record(), { readPepper: async () => undefined });

    expect(await authorize(built, { user_id: "u2", pin: "1234" }, "record_cash_in")).toEqual({
      kind: "unavailable",
    });
  });

  it("leaves the failures alone when the person lacks the permission", async () => {
    const { built, failures } = deps(record(), {}, { u2: failuresAt(2) });

    await authorize(built, { user_id: "u2", pin: "9999" }, "void_sale");

    expect(failures.get("u2")).toEqual(failuresAt(2));
  });

  it("counts nothing for a person who cannot be found", async () => {
    const { built, failures } = deps();

    await authorize(built, { user_id: "nobody", pin: "9999" }, "record_cash_in");

    expect(failures.size).toBe(0);
  });

  it("is unavailable, counting nothing, when the register has no pepper", async () => {
    const { built, failures } = deps(record(), { readPepper: async () => undefined });

    await authorize(built, { user_id: "u2", pin: "9999" }, "record_cash_in");

    expect(failures.size).toBe(0);
  });

  it("cannot be asked for a permission the person must hold personally", () => {
    expectTypeOf<"sell_and_charge">().not.toExtend<Parameters<typeof authorize>[2]>();
    expectTypeOf<"record_cash_in">().toExtend<Parameters<typeof authorize>[2]>();
  });

  describe("after wrong PINs", () => {
    it("counts a wrong PIN against the person whose PIN was entered", async () => {
      const { built, failures } = deps();

      await authorize(built, { user_id: "u2", pin: "9999" }, "record_cash_in");

      expect(failures.get("u2")).toEqual({ consecutiveFailures: 1, lastFailedAt: NOW });
    });

    it("makes the person wait from the third wrong PIN", async () => {
      const { built } = deps(record(), {}, { u2: failuresAt(2) });

      expect(await authorize(built, { user_id: "u2", pin: "9999" }, "record_cash_in")).toEqual({
        kind: "wrong_pin",
        retry_after_seconds: 1,
        attempts_left: 5,
      });
    });

    it("locks the person out with the eighth wrong PIN", async () => {
      const { built } = deps(record(), {}, { u2: failuresAt(7) });

      expect(await authorize(built, { user_id: "u2", pin: "9999" }, "record_cash_in")).toEqual({
        kind: "locked",
        consecutive_failures: 8,
      });
    });

    it("refuses, without hashing or counting, while the wait runs", async () => {
      const waiting = failuresAt(4, 1);
      const { built, hashed, failures } = deps(record(), {}, { u2: waiting });

      expect(await authorize(built, { user_id: "u2", pin: "1234" }, "record_cash_in")).toEqual({
        kind: "rate_limited",
        retry_after_seconds: 1,
        attempts_left: 4,
      });
      expect(hashed).toEqual([]);
      expect(failures.get("u2")).toEqual(waiting);
    });

    it("checks the PIN again once the wait is over", async () => {
      const { built } = deps(record(), {}, { u2: failuresAt(4, 4) });

      expect((await authorize(built, { user_id: "u2", pin: "1234" }, "record_cash_in")).kind).toBe(
        "authorized",
      );
    });

    it("refuses a locked person, even with the right PIN, without hashing or counting", async () => {
      const locked = failuresAt(8);
      const { built, hashed, failures } = deps(record(), {}, { u2: locked });

      expect(await authorize(built, { user_id: "u2", pin: "1234" }, "record_cash_in")).toEqual({
        kind: "locked",
        consecutive_failures: 8,
      });
      expect(hashed).toEqual([]);
      expect(failures.get("u2")).toEqual(locked);
    });

    it("clears the failures of a person who enters the right PIN", async () => {
      const { built, failures } = deps(record(), {}, { u2: failuresAt(2), u3: failuresAt(2) });

      await authorize(built, { user_id: "u2", pin: "1234" }, "record_cash_in");

      expect([...failures.keys()]).toEqual(["u3"]);
    });

    it("adds up with the wrong PINs the same person entered to sign in", async () => {
      const { built } = deps();
      const attempt = { ...built.store, signInRecord: () => record() };

      await signIn({ ...built, store: attempt }, "u2", "9999");
      await signIn({ ...built, store: attempt }, "u2", "9999");

      expect(await authorize(built, { user_id: "u2", pin: "9999" }, "record_cash_in")).toEqual({
        kind: "wrong_pin",
        retry_after_seconds: 1,
        attempts_left: 5,
      });
    });

    it("adds up with the wrong PINs entered to authorize when the person signs in", async () => {
      const { built } = deps();

      await authorize(built, { user_id: "u2", pin: "9999" }, "record_cash_in");
      await authorize(built, { user_id: "u2", pin: "9999" }, "record_cash_in");

      expect(await signIn(built, "u2", "9999")).toEqual({
        kind: "wrong_pin",
        retry_after_seconds: 1,
        attempts_left: 5,
      });
    });
  });
});
