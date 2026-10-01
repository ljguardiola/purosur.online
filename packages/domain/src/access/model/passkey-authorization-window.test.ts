import { describe, expect, it } from "vitest";
import {
  hasValidPasskeyAuthorization,
  PASSKEY_AUTHORIZATION_WINDOW_MS,
} from "./passkey-authorization-window.js";

const AUTHORIZED_AT = new Date("2026-10-01T12:00:00.000Z");

function after(ms: number): Date {
  return new Date(AUTHORIZED_AT.getTime() + ms);
}

describe("passkey authorization window", () => {
  it("lasts 5 minutes", () => {
    expect(PASSKEY_AUTHORIZATION_WINDOW_MS).toBe(5 * 60 * 1000);
  });
});

describe("hasValidPasskeyAuthorization", () => {
  it("is not valid for a session never authorized with a passkey", () => {
    expect(hasValidPasskeyAuthorization({ passkeyAuthorizedAt: null }, AUTHORIZED_AT)).toBe(false);
  });

  it("is valid at the moment of authorization", () => {
    expect(hasValidPasskeyAuthorization({ passkeyAuthorizedAt: AUTHORIZED_AT }, AUTHORIZED_AT)).toBe(
      true,
    );
  });

  it("is valid exactly 5 minutes after the authorization", () => {
    expect(
      hasValidPasskeyAuthorization({ passkeyAuthorizedAt: AUTHORIZED_AT }, after(5 * 60 * 1000)),
    ).toBe(true);
  });

  it("is not valid one millisecond after the 5 minutes", () => {
    expect(
      hasValidPasskeyAuthorization(
        { passkeyAuthorizedAt: AUTHORIZED_AT },
        after(5 * 60 * 1000 + 1),
      ),
    ).toBe(false);
  });

  it("stays valid for the same window however many sensitive actions it covers, since using it does not reset it", () => {
    const session = { passkeyAuthorizedAt: AUTHORIZED_AT };

    expect(hasValidPasskeyAuthorization(session, after(4 * 60 * 1000))).toBe(true);
    expect(hasValidPasskeyAuthorization(session, after(4 * 60 * 1000))).toBe(true);
    expect(hasValidPasskeyAuthorization(session, after(6 * 60 * 1000))).toBe(false);
  });
});
