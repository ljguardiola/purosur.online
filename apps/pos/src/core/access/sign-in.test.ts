import { encodePinHash, PERMISSION_KEYS } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { hashPin } from "./pin-hash";
import { derivePinVerifier } from "./pin-verifier";
import { type FirstSignInDeps, firstSignIn, type SignInDeps, signIn } from "./sign-in";
import type { PinSignInFailures, SignInRecord } from "./sqlite-sign-in-store";

const PEPPER = Buffer.alloc(32, 7).toString("base64url");
const SALT = encodePinHash(new Uint8Array(16).fill(1));
const PIN_HASH = "hash-of-the-right-pin";

function record(overrides: Partial<SignInRecord> = {}): SignInRecord {
  return {
    firstName: "Ada",
    salt: SALT,
    verifier: derivePinVerifier(PEPPER, PIN_HASH),
    access: { isAdministrator: false, permissionKeys: ["sell_and_charge", "adjust_stock"] },
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

interface Options extends Partial<Omit<SignInDeps, "store">> {
  record?: SignInRecord | undefined;
  failures?: Record<string, PinSignInFailures>;
}

function deps(options: Options = {}) {
  const hashed: { pin: string; salt: Uint8Array }[] = [];
  const remembered: string[] = [];
  const failures = new Map(Object.entries(options.failures ?? {}));
  const {
    record: stored,
    failures: _failures,
    ...rest
  } = "record" in options ? options : { record: record(), ...options };
  const built: FirstSignInDeps = {
    store: {
      remember: (userId) => {
        remembered.push(userId);
      },
      signInRecord: () => stored,
      pinSignInFailures: (userId) => failures.get(userId),
      recordPinSignInFailure: (userId, at) => {
        const next = {
          consecutiveFailures: (failures.get(userId)?.consecutiveFailures ?? 0) + 1,
          lastFailedAt: at,
        };
        failures.set(userId, next);
        return next;
      },
      withdrawPinSignInFailure: (userId) => {
        const current = failures.get(userId);
        if (current === undefined) {
          return;
        }
        if (current.consecutiveFailures === 1) {
          failures.delete(userId);
        } else {
          failures.set(userId, {
            ...current,
            consecutiveFailures: current.consecutiveFailures - 1,
          });
        }
      },
      clearPinSignInFailures: (userId) => {
        failures.delete(userId);
      },
    },
    readPepper: async () => PEPPER,
    hashPin: async (pin, salt) => {
      hashed.push({ pin, salt });
      return pin === "1234" ? PIN_HASH : "hash-of-another-pin";
    },
    now: () => NOW,
    ...rest,
  };
  return { built, hashed, failures, remembered };
}

describe("signing in", () => {
  it("signs in a person who enters the right PIN and holds a register permission", async () => {
    expect(await signIn(deps().built, "u1", "1234")).toEqual({
      kind: "signed_in",
      person: { first_name: "Ada", permission_keys: ["sell_and_charge", "adjust_stock"] },
    });
  });

  it("hashes the PIN with the salt the user was given", async () => {
    const { built, hashed } = deps();

    await signIn(built, "u1", "1234");

    expect(hashed).toEqual([{ pin: "1234", salt: new Uint8Array(16).fill(1) }]);
  });

  it("refuses a wrong PIN", async () => {
    expect(await signIn(deps().built, "u1", "9999")).toEqual({
      kind: "wrong_pin",
      retry_after_seconds: 0,
      attempts_left: 7,
    });
  });

  it("refuses a user who cannot sign in as it refuses a wrong PIN", async () => {
    const { built, hashed } = deps({ record: undefined });

    expect(await signIn(built, "u1", "1234")).toEqual({
      kind: "wrong_pin",
      retry_after_seconds: 0,
      attempts_left: 7,
    });
    expect(hashed).toEqual([]);
  });

  it("refuses a user whose salt is not a valid salt as it refuses a wrong PIN", async () => {
    expect(await signIn(deps({ record: record({ salt: "c2FsdA" }) }).built, "u1", "1234")).toEqual({
      kind: "wrong_pin",
      retry_after_seconds: 0,
      attempts_left: 7,
    });
  });

  it("refuses a stored verifier of another length without failing", async () => {
    expect(
      await signIn(deps({ record: record({ verifier: "short" }) }).built, "u1", "1234"),
    ).toEqual({ kind: "wrong_pin", retry_after_seconds: 0, attempts_left: 7 });
  });

  it("refuses a verifier made with another pepper", async () => {
    const otherPepper = Buffer.alloc(32, 9).toString("base64url");
    const stored = record({ verifier: derivePinVerifier(otherPepper, PIN_HASH) });

    expect(await signIn(deps({ record: stored }).built, "u1", "1234")).toEqual({
      kind: "wrong_pin",
      retry_after_seconds: 0,
      attempts_left: 7,
    });
  });

  it("is unavailable when the register has no pepper, without hashing", async () => {
    const { built, hashed } = deps({ readPepper: async () => undefined });

    expect(await signIn(built, "u1", "1234")).toEqual({ kind: "unavailable" });
    expect(hashed).toEqual([]);
  });

  it("does not open the register to a right PIN whose person holds no register permission", async () => {
    const stored = record({
      access: { isAdministrator: false, permissionKeys: ["manage_suppliers"] },
    });

    expect(await signIn(deps({ record: stored }).built, "u1", "1234")).toEqual({
      kind: "no_register_permission",
    });
  });

  it("tells a wrong PIN before it tells a missing permission", async () => {
    const stored = record({ access: { isAdministrator: false, permissionKeys: [] } });

    expect(await signIn(deps({ record: stored }).built, "u1", "9999")).toEqual({
      kind: "wrong_pin",
      retry_after_seconds: 0,
      attempts_left: 7,
    });
  });

  it("signs in an Administrator with every permission of the catalog", async () => {
    const stored = record({ access: { isAdministrator: true, permissionKeys: [] } });

    const outcome = await signIn(deps({ record: stored }).built, "u1", "1234");

    expect(outcome.kind).toBe("signed_in");
    expect(outcome.kind === "signed_in" && outcome.person.permission_keys).toEqual([
      ...PERMISSION_KEYS,
    ]);
  });

  it("signs in with the real PIN hash scheme", async () => {
    const realHash = await hashPin("123456", new Uint8Array(16).fill(1));
    const stored = record({ verifier: derivePinVerifier(PEPPER, realHash) });

    expect(
      (await signIn({ ...deps({ record: stored }).built, hashPin }, "u1", "123456")).kind,
    ).toBe("signed_in");
    expect(
      (await signIn({ ...deps({ record: stored }).built, hashPin }, "u1", "654321")).kind,
    ).toBe("wrong_pin");
  });
});

describe("signing in after wrong PINs", () => {
  it("counts a wrong PIN and tells how many attempts are left, without a wait for the first two", async () => {
    const { built, failures } = deps();

    expect(await signIn(built, "u1", "9999")).toEqual({
      kind: "wrong_pin",
      retry_after_seconds: 0,
      attempts_left: 7,
    });
    expect(await signIn(built, "u1", "9999")).toEqual({
      kind: "wrong_pin",
      retry_after_seconds: 0,
      attempts_left: 6,
    });
    expect(failures.get("u1")).toEqual({ consecutiveFailures: 2, lastFailedAt: NOW });
  });

  it("makes the person wait from the third wrong PIN", async () => {
    const { built } = deps({ failures: { u1: failuresAt(2) } });

    expect(await signIn(built, "u1", "9999")).toEqual({
      kind: "wrong_pin",
      retry_after_seconds: 1,
      attempts_left: 5,
    });
  });

  it("locks the person out with the eighth wrong PIN", async () => {
    const { built, failures } = deps({ failures: { u1: failuresAt(7) } });

    expect(await signIn(built, "u1", "9999")).toEqual({ kind: "locked", consecutive_failures: 8 });
    expect(failures.get("u1")?.consecutiveFailures).toBe(8);
  });

  it("tells a wait is pending, without hashing or counting, before the wait is over", async () => {
    const { built, hashed, failures } = deps({ failures: { u1: failuresAt(5, 1) } });

    expect(await signIn(built, "u1", "1234")).toEqual({
      kind: "rate_limited",
      retry_after_seconds: 3,
      attempts_left: 3,
    });
    expect(hashed).toEqual([]);
    expect(failures.get("u1")?.consecutiveFailures).toBe(5);
  });

  it("checks the PIN again once the wait is over", async () => {
    const { built } = deps({ failures: { u1: failuresAt(4, 4) } });

    expect((await signIn(built, "u1", "1234")).kind).toBe("signed_in");
  });

  it("refuses a locked person, even with the right PIN, without hashing or counting", async () => {
    const { built, hashed, failures } = deps({ failures: { u1: failuresAt(8) } });

    expect(await signIn(built, "u1", "1234")).toEqual({ kind: "locked", consecutive_failures: 8 });
    expect(hashed).toEqual([]);
    expect(failures.get("u1")?.consecutiveFailures).toBe(8);
  });

  it("tells a locked person is locked though the register has no pepper", async () => {
    const { built } = deps({ failures: { u1: failuresAt(8) }, readPepper: async () => undefined });

    expect(await signIn(built, "u1", "1234")).toEqual({ kind: "locked", consecutive_failures: 8 });
  });

  it("counts nothing when the register has no pepper", async () => {
    const { built, failures } = deps({ readPepper: async () => undefined });

    await signIn(built, "u1", "9999");

    expect(failures.size).toBe(0);
  });

  it("clears the failures of a person who enters the right PIN", async () => {
    const { built, failures } = deps({ failures: { u1: failuresAt(2) } });

    await signIn(built, "u1", "1234");

    expect(failures.has("u1")).toBe(false);
  });

  it("clears the failures of a right PIN whose person holds no register permission", async () => {
    const stored = record({ access: { isAdministrator: false, permissionKeys: [] } });
    const { built, failures } = deps({ record: stored, failures: { u1: failuresAt(2) } });

    expect((await signIn(built, "u1", "1234")).kind).toBe("no_register_permission");
    expect(failures.has("u1")).toBe(false);
  });

  it("leaves another person's failures alone when one enters the right PIN", async () => {
    const { built, failures } = deps({ failures: { u2: failuresAt(6) } });

    await signIn(built, "u1", "1234");

    expect(failures.get("u2")?.consecutiveFailures).toBe(6);
  });

  function hashingHeldUntilReleased(
    built: SignInDeps,
    hashed: { pin: string; salt: Uint8Array }[],
  ) {
    const pending: (() => void)[] = [];
    let released = false;
    let firstHashingStarted: () => void = () => {};
    const firstHashing = new Promise<void>((resolve) => {
      firstHashingStarted = resolve;
    });
    const held: SignInDeps = {
      ...built,
      hashPin: (pin, salt) => {
        hashed.push({ pin, salt });
        firstHashingStarted();
        return new Promise<string>((resolve) => {
          const finish = () => resolve(pin === "1234" ? PIN_HASH : "hash-of-another-pin");
          if (released) {
            finish();
          } else {
            pending.push(finish);
          }
        });
      },
    };
    const release = () => {
      released = true;
      for (const finish of pending) {
        finish();
      }
    };
    return { held, firstHashing, release };
  }

  it("refuses a second attempt in flight for the same person with the wait the first one brings", async () => {
    const { built, hashed, failures } = deps({ failures: { u1: failuresAt(2) } });
    const { held, firstHashing, release } = hashingHeldUntilReleased(built, hashed);

    const attempts = Promise.all([signIn(held, "u1", "9999"), signIn(held, "u1", "9999")]);
    await firstHashing;
    release();

    expect(await attempts).toEqual([
      { kind: "wrong_pin", retry_after_seconds: 1, attempts_left: 5 },
      { kind: "rate_limited", retry_after_seconds: 1, attempts_left: 5 },
    ]);
    expect(hashed).toHaveLength(1);
    expect(failures.get("u1")).toEqual({ consecutiveFailures: 3, lastFailedAt: NOW });
  });

  it("locks out a second attempt in flight when the first one reaches the lockout", async () => {
    const { built, hashed, failures } = deps({ failures: { u1: failuresAt(7) } });
    const { held, firstHashing, release } = hashingHeldUntilReleased(built, hashed);

    const attempts = Promise.all([signIn(held, "u1", "9999"), signIn(held, "u1", "1234")]);
    await firstHashing;
    release();

    expect(await attempts).toEqual([
      { kind: "locked", consecutive_failures: 8 },
      { kind: "locked", consecutive_failures: 8 },
    ]);
    expect(hashed).toHaveLength(1);
    expect(failures.get("u1")?.consecutiveFailures).toBe(8);
  });

  it("withdraws the attempt it counted when hashing the PIN fails, and fails", async () => {
    const failure = new Error("hashing failed");
    const { built, failures } = deps({
      failures: { u1: failuresAt(2) },
      hashPin: async () => {
        throw failure;
      },
    });

    await expect(signIn(built, "u1", "1234")).rejects.toBe(failure);
    expect(failures.get("u1")?.consecutiveFailures).toBe(2);
  });

  it("does not lock out a person one wrong PIN from the lockout when hashing the PIN fails", async () => {
    const { built, failures } = deps({
      failures: { u1: failuresAt(7) },
      hashPin: async () => {
        throw new Error("hashing failed");
      },
    });

    await expect(signIn(built, "u1", "1234")).rejects.toThrow("hashing failed");
    expect(failures.get("u1")?.consecutiveFailures).toBe(7);
  });

  it("leaves no failures behind when hashing the first attempt's PIN fails", async () => {
    const { built, failures } = deps({
      hashPin: async () => {
        throw new Error("hashing failed");
      },
    });

    await expect(signIn(built, "u1", "1234")).rejects.toThrow("hashing failed");
    expect(failures.has("u1")).toBe(false);
  });

  it("counts nothing for a user who cannot sign in", async () => {
    const { built, failures } = deps({ record: undefined });

    await signIn(built, "u1", "9999");

    expect(failures.size).toBe(0);
  });
});

describe("signing in for the first time on a register", () => {
  it("signs in a person who enters the right PIN and remembers them", async () => {
    const { built, remembered } = deps();

    expect(await firstSignIn(built, "u1", "1234")).toEqual({
      kind: "signed_in",
      person: { first_name: "Ada", permission_keys: ["sell_and_charge", "adjust_stock"] },
    });
    expect(remembered).toEqual(["u1"]);
  });

  it("remembers nobody who enters a wrong PIN, and counts it like any sign-in", async () => {
    const { built, remembered, failures } = deps();

    expect(await firstSignIn(built, "u1", "9999")).toEqual({
      kind: "wrong_pin",
      retry_after_seconds: 0,
      attempts_left: 7,
    });
    expect(remembered).toEqual([]);
    expect(failures.get("u1")?.consecutiveFailures).toBe(1);
  });

  it("makes a person with wrong PINs wait, as any sign-in does", async () => {
    const { built, remembered } = deps({ failures: { u1: failuresAt(5, 1) } });

    expect(await firstSignIn(built, "u1", "1234")).toMatchObject({ kind: "rate_limited" });
    expect(remembered).toEqual([]);
  });

  it("refuses a locked person even with the right PIN", async () => {
    const { built, remembered } = deps({ failures: { u1: failuresAt(8) } });

    expect(await firstSignIn(built, "u1", "1234")).toMatchObject({ kind: "locked" });
    expect(remembered).toEqual([]);
  });

  it("remembers nobody whose right PIN opens no register permission", async () => {
    const { built, remembered } = deps({
      record: record({ access: { isAdministrator: false, permissionKeys: [] } }),
    });

    expect(await firstSignIn(built, "u1", "1234")).toEqual({ kind: "no_register_permission" });
    expect(remembered).toEqual([]);
  });

  it("remembers nobody who cannot sign in", async () => {
    const { built, remembered } = deps({ record: undefined });

    expect(await firstSignIn(built, "u1", "1234")).toMatchObject({ kind: "wrong_pin" });
    expect(remembered).toEqual([]);
  });
});
