import { describe, expect, it } from "vitest";
import {
  RECOVERY_TOKEN_LIFETIME_MS,
  recoveryTokenExpiresAt,
  recoveryTokenStatus,
  supersedesRecoveryRequest,
  wasRecoveryRequestServed,
} from "./recovery-token.js";

const ISSUED_AT = new Date("2026-10-01T12:00:00.000Z");
const EXPIRES_AT = new Date("2026-10-01T12:15:00.000Z");
const USED_AT = new Date("2026-10-01T12:05:00.000Z");

function after(date: Date, ms: number): Date {
  return new Date(date.getTime() + ms);
}

const UNTOUCHED = { expiresAt: EXPIRES_AT, usedAt: null, voidedAt: null };

describe("recovery token lifetime", () => {
  it("lasts 15 minutes", () => {
    expect(RECOVERY_TOKEN_LIFETIME_MS).toBe(15 * 60 * 1000);
    expect(recoveryTokenExpiresAt(ISSUED_AT)).toEqual(EXPIRES_AT);
  });
});

describe("recoveryTokenStatus", () => {
  it("is valid while unused, unvoided and before it expires", () => {
    expect(recoveryTokenStatus(UNTOUCHED, after(EXPIRES_AT, -1))).toBe("valid");
  });

  it("is expired exactly when it expires", () => {
    expect(recoveryTokenStatus(UNTOUCHED, EXPIRES_AT)).toBe("expired");
  });

  it("is expired after it expires", () => {
    expect(recoveryTokenStatus(UNTOUCHED, after(EXPIRES_AT, 1))).toBe("expired");
  });

  it("is burned once used", () => {
    expect(recoveryTokenStatus({ ...UNTOUCHED, usedAt: USED_AT }, ISSUED_AT)).toBe("burned");
  });

  it("is burned once voided", () => {
    expect(recoveryTokenStatus({ ...UNTOUCHED, voidedAt: USED_AT }, ISSUED_AT)).toBe("burned");
  });

  it("is burned, not expired, when it was used and has also expired", () => {
    expect(recoveryTokenStatus({ ...UNTOUCHED, usedAt: USED_AT }, after(EXPIRES_AT, 1))).toBe(
      "burned",
    );
  });

  it("is burned, not expired, when it was voided and has also expired", () => {
    expect(recoveryTokenStatus({ ...UNTOUCHED, voidedAt: USED_AT }, after(EXPIRES_AT, 1))).toBe(
      "burned",
    );
  });
});

describe("supersedesRecoveryRequest", () => {
  const REQUEST = { requestId: "request-a", requestedAt: ISSUED_AT };

  it("is true for another request made later", () => {
    const other = { requestId: "request-b", requestedAt: after(ISSUED_AT, 1) };

    expect(supersedesRecoveryRequest(other, REQUEST)).toBe(true);
  });

  it("is true for another request made at the same moment", () => {
    const other = { requestId: "request-b", requestedAt: ISSUED_AT };

    expect(supersedesRecoveryRequest(other, REQUEST)).toBe(true);
  });

  it("is false for another request made earlier", () => {
    const other = { requestId: "request-b", requestedAt: after(ISSUED_AT, -1) };

    expect(supersedesRecoveryRequest(other, REQUEST)).toBe(false);
  });

  it("is false for the request itself", () => {
    expect(
      supersedesRecoveryRequest({ ...REQUEST, requestedAt: after(ISSUED_AT, 1) }, REQUEST),
    ).toBe(false);
  });
});

describe("wasRecoveryRequestServed", () => {
  const sent = { requestId: "request-a", requestedAt: ISSUED_AT, sentAt: USED_AT };
  const unsent = { requestId: "request-a", requestedAt: ISSUED_AT, sentAt: null };

  it("is true when a stored token of the request was sent", () => {
    expect(wasRecoveryRequestServed([unsent, sent], "request-a")).toBe(true);
  });

  it("is false when no stored token of the request was sent", () => {
    expect(wasRecoveryRequestServed([unsent], "request-a")).toBe(false);
  });

  it("is false when only another request's token was sent", () => {
    expect(wasRecoveryRequestServed([{ ...sent, requestId: "request-b" }], "request-a")).toBe(
      false,
    );
  });

  it("is false when nothing is stored", () => {
    expect(wasRecoveryRequestServed([], "request-a")).toBe(false);
  });
});
