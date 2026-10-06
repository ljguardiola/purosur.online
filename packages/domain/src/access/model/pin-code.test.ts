import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  isPinCodeBurned,
  isPinCodeExpired,
  isPinCodeLive,
  isWellFormedPinCode,
  mayEmitPinCode,
  mayEmitPinCodeFor,
  mayRequestPinCodeFor,
  normalizePinCode,
  pinCodeExpiresAt,
  pinCodeRetryAfterSeconds,
  pinCodeWindowStart,
} from "./pin-code.js";

const NOW = new Date("2026-09-29T12:00:00.000Z");

function minutesAgo(minutes: number): Date {
  return new Date(NOW.getTime() - minutes * 60 * 1000);
}

describe("isWellFormedPinCode", () => {
  it("accepts every code of 16 base32 characters", () => {
    fc.assert(
      fc.property(
        fc.string({
          unit: fc.constantFrom(..."ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"),
          minLength: 16,
          maxLength: 16,
        }),
        (code) => isWellFormedPinCode(code),
      ),
    );
  });

  it.each([
    ["one character short", "P4NX7KWE2QRT5MZ"],
    ["one character long", "P4NX7KWE2QRT5MZDA"],
    ["empty", ""],
    ["a digit outside base32", "P4NX7KWE1QRT5MZD"],
    ["a lowercase letter", "p4NX7KWE2QRT5MZD"],
    ["padding", "P4NX7KWE2QRT5MZ="],
    ["a leading line break", "\nP4NX7KWE2QRT5MZD"],
    ["a trailing line break", "P4NX7KWE2QRT5MZD\n"],
  ])("rejects a code with %s", (_case, code) => {
    expect(isWellFormedPinCode(code)).toBe(false);
  });
});

describe("pinCodeExpiresAt", () => {
  it("expires 15 minutes after emission", () => {
    expect(pinCodeExpiresAt(NOW)).toEqual(new Date("2026-09-29T12:15:00.000Z"));
  });
});

describe("pinCodeWindowStart", () => {
  it("counts codes from one hour before now", () => {
    expect(pinCodeWindowStart(NOW)).toEqual(minutesAgo(60));
  });
});

describe("pinCodeRetryAfterSeconds", () => {
  it("accepts an emission while fewer than 5 codes were issued in the last hour", () => {
    expect(pinCodeRetryAfterSeconds([1, 2, 3, 4].map(minutesAgo), NOW)).toBeUndefined();
  });

  it("refuses an emission once 5 codes were issued in the last hour, until the oldest leaves it", () => {
    expect(pinCodeRetryAfterSeconds([1, 2, 3, 4, 50].map(minutesAgo), NOW)).toBe(10 * 60);
  });

  it("waits for the fifth newest code when more are counted, in any order", () => {
    expect(pinCodeRetryAfterSeconds([59, 1, 2, 3, 4, 40, 30].map(minutesAgo), NOW)).toBe(30 * 60);
  });

  it("rounds a partial second up", () => {
    const oldest = new Date(NOW.getTime() - 59 * 60 * 1000 - 500);

    expect(pinCodeRetryAfterSeconds([1, 2, 3, 4].map(minutesAgo).concat(oldest), NOW)).toBe(60);
  });

  it("does not count a code issued exactly one hour ago", () => {
    expect(pinCodeRetryAfterSeconds([1, 2, 3, 4, 60].map(minutesAgo), NOW)).toBeUndefined();
  });

  it("does not count codes older than an hour", () => {
    expect(pinCodeRetryAfterSeconds([1, 2, 3, 4, 90, 120].map(minutesAgo), NOW)).toBeUndefined();
  });
});

describe("mayEmitPinCodeFor", () => {
  const person = { id: "person-1", isAdministrator: false };
  const administrator = { id: "admin-1", isAdministrator: true };

  it("lets a person who is not an Administrator emit for another user who is not one", () => {
    expect(mayEmitPinCodeFor(person, { id: "person-2", isAdministrator: false })).toBe(true);
  });

  it("lets a person who is not an Administrator emit for their own account", () => {
    expect(mayEmitPinCodeFor(person, person)).toBe(true);
  });

  it("refuses a person who is not an Administrator an Administrator's account", () => {
    expect(mayEmitPinCodeFor(person, administrator)).toBe(false);
  });

  it("lets an Administrator emit for a user who is not an Administrator", () => {
    expect(mayEmitPinCodeFor(administrator, person)).toBe(true);
  });

  it("lets an Administrator emit for another Administrator", () => {
    expect(mayEmitPinCodeFor(administrator, { id: "admin-2", isAdministrator: true })).toBe(true);
  });

  it("lets an Administrator emit for their own account", () => {
    expect(mayEmitPinCodeFor(administrator, administrator)).toBe(true);
  });
});

describe("mayRequestPinCodeFor", () => {
  const person = { id: "person-1", isAdministrator: false, permissionKeys: [] };

  it("lets anyone request one for their own account, holding no permission", () => {
    expect(mayRequestPinCodeFor(person, "person-1")).toBe(true);
  });

  it("refuses one who does not hold the permission a code for another person", () => {
    expect(mayRequestPinCodeFor(person, "person-2")).toBe(false);
  });

  it("lets one who may reset PINs request one for another person", () => {
    expect(
      mayRequestPinCodeFor({ ...person, permissionKeys: ["reset_user_pin"] }, "person-2"),
    ).toBe(true);
  });
});

describe("mayEmitPinCode", () => {
  const resetter = {
    id: "person-1",
    isAdministrator: false,
    permissionKeys: ["reset_user_pin"],
  };
  const activePerson = { id: "person-2", isAdministrator: false, active: true };

  it("lets one who may reset PINs emit for an active user they may emit for", () => {
    expect(mayEmitPinCode(resetter, activePerson)).toBe(true);
  });

  it("refuses an inactive user", () => {
    expect(mayEmitPinCode(resetter, { ...activePerson, active: false })).toBe(false);
  });

  it("refuses one who may not reset PINs", () => {
    expect(
      mayEmitPinCode({ ...resetter, permissionKeys: ["deactivate_users"] }, activePerson),
    ).toBe(false);
  });

  it("lets anyone emit for their own active account without holding the permission", () => {
    const person = { id: "person-3", isAdministrator: false, permissionKeys: [] };

    expect(mayEmitPinCode(person, { ...person, active: true })).toBe(true);
  });

  it("refuses their own inactive account", () => {
    const person = { id: "person-3", isAdministrator: false, permissionKeys: [] };

    expect(mayEmitPinCode(person, { ...person, active: false })).toBe(false);
  });

  it("refuses one without the permission another person's account", () => {
    const person = { id: "person-3", isAdministrator: false, permissionKeys: [] };

    expect(mayEmitPinCode(person, activePerson)).toBe(false);
  });

  it("refuses a user the actor may not emit for", () => {
    expect(mayEmitPinCode(resetter, { ...activePerson, isAdministrator: true })).toBe(false);
  });

  it("lets an Administrator, who holds every permission, emit for their own active account", () => {
    const administrator = { id: "admin-1", isAdministrator: true, permissionKeys: [] };

    expect(mayEmitPinCode(administrator, { ...administrator, active: true })).toBe(true);
  });
});

describe("normalizePinCode", () => {
  it("strips spaces and dashes and uppercases what was typed", () => {
    expect(normalizePinCode("p4nx-7kwe 2qrt-5mzd")).toBe("P4NX7KWE2QRT5MZD");
  });

  it("strips tabs and line breaks", () => {
    expect(normalizePinCode("p4nx\t7kwe\n2qrt5mzd")).toBe("P4NX7KWE2QRT5MZD");
  });

  it("leaves an already normalized code as it is", () => {
    fc.assert(
      fc.property(
        fc.string({
          unit: fc.constantFrom(..."ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"),
          minLength: 16,
          maxLength: 16,
        }),
        (code) => normalizePinCode(code) === code,
      ),
    );
  });
});

describe("isPinCodeBurned", () => {
  const LIVE = { redeemedAt: null, supersededAt: null, failedAttempts: 0 };

  it("keeps a code that was neither redeemed, superseded nor failed five times", () => {
    expect(isPinCodeBurned({ ...LIVE, failedAttempts: 4 })).toBe(false);
  });

  it("burns a redeemed code", () => {
    expect(isPinCodeBurned({ ...LIVE, redeemedAt: NOW })).toBe(true);
  });

  it("burns a superseded code", () => {
    expect(isPinCodeBurned({ ...LIVE, supersededAt: NOW })).toBe(true);
  });

  it.each([5, 6])("burns a code with %i failed attempts", (failedAttempts) => {
    expect(isPinCodeBurned({ ...LIVE, failedAttempts })).toBe(true);
  });
});

describe("isPinCodeExpired", () => {
  it("is not expired one millisecond before its expiry", () => {
    expect(isPinCodeExpired(new Date(NOW.getTime() + 1), NOW)).toBe(false);
  });

  it("is expired at its expiry", () => {
    expect(isPinCodeExpired(NOW, NOW)).toBe(true);
  });

  it("is expired after its expiry", () => {
    expect(isPinCodeExpired(new Date(NOW.getTime() - 1), NOW)).toBe(true);
  });
});

describe("isPinCodeLive", () => {
  const LIVE = {
    redeemedAt: null,
    supersededAt: null,
    failedAttempts: 0,
    expiresAt: new Date(NOW.getTime() + 1),
  };

  it("is live while neither burned nor expired", () => {
    expect(isPinCodeLive(LIVE, NOW)).toBe(true);
  });

  it("is not live once burned", () => {
    expect(isPinCodeLive({ ...LIVE, supersededAt: NOW }, NOW)).toBe(false);
  });

  it("is not live once expired", () => {
    expect(isPinCodeLive({ ...LIVE, expiresAt: NOW }, NOW)).toBe(false);
  });
});
