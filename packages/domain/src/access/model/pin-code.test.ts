import { describe, expect, it } from "vitest";
import {
  mayEmitPinCodeFor,
  PIN_CODE_HOURLY_LIMIT,
  PIN_CODE_MAX_FAILED_ATTEMPTS,
  PIN_CODE_VALIDITY_MS,
  PIN_CODE_WINDOW_MS,
  pinCodeExpiresAt,
  pinCodeRetryAfterSeconds,
  pinCodeWindowStart,
} from "./pin-code.js";

const NOW = new Date("2026-09-29T12:00:00.000Z");

function minutesAgo(minutes: number): Date {
  return new Date(NOW.getTime() - minutes * 60 * 1000);
}

describe("PIN code limits", () => {
  it("lives 15 minutes, is burned after 5 failed attempts and is emitted at most 5 times an hour", () => {
    expect(PIN_CODE_VALIDITY_MS).toBe(15 * 60 * 1000);
    expect(PIN_CODE_MAX_FAILED_ATTEMPTS).toBe(5);
    expect(PIN_CODE_HOURLY_LIMIT).toBe(5);
    expect(PIN_CODE_WINDOW_MS).toBe(60 * 60 * 1000);
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

  it("refuses a person who is not an Administrator their own account", () => {
    expect(mayEmitPinCodeFor(person, person)).toBe(false);
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
