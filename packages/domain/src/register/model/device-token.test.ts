import { describe, expect, it } from "vitest";
import {
  deviceTokenExpiresAt,
  isDeviceTokenExpired,
  isDeviceTokenRotationDue,
} from "./device-token.js";

const ISSUED_AT = new Date("2026-09-29T12:00:00.000Z");
const SEVEN_DAYS_LATER = new Date("2026-10-06T12:00:00.000Z");
const ONE_DAY_LATER = new Date("2026-09-30T12:00:00.000Z");

function millisecondsBefore(moment: Date): Date {
  return new Date(moment.getTime() - 1);
}

describe("deviceTokenExpiresAt", () => {
  it("expires 7 days after it is issued", () => {
    expect(deviceTokenExpiresAt(ISSUED_AT)).toEqual(SEVEN_DAYS_LATER);
  });
});

describe("isDeviceTokenExpired", () => {
  it("is valid at the moment it is issued", () => {
    expect(isDeviceTokenExpired(ISSUED_AT, ISSUED_AT)).toBe(false);
  });

  it("is valid until the last instant of its 7 days", () => {
    expect(isDeviceTokenExpired(ISSUED_AT, millisecondsBefore(SEVEN_DAYS_LATER))).toBe(false);
  });

  it("is expired from the instant its 7 days are over", () => {
    expect(isDeviceTokenExpired(ISSUED_AT, SEVEN_DAYS_LATER)).toBe(true);
  });
});

describe("isDeviceTokenRotationDue", () => {
  it("is not due when the register has just received the token", () => {
    expect(isDeviceTokenRotationDue(ISSUED_AT, ISSUED_AT)).toBe(false);
  });

  it("is not due until the last instant of the 24 hours", () => {
    expect(isDeviceTokenRotationDue(ISSUED_AT, millisecondsBefore(ONE_DAY_LATER))).toBe(false);
  });

  it("is due from the instant 24 hours have passed", () => {
    expect(isDeviceTokenRotationDue(ISSUED_AT, ONE_DAY_LATER)).toBe(true);
  });
});
