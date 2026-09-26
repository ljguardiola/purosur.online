import { describe, expect, it } from "vitest";
import { ALERT_KINDS, isAlertKind } from "./alert-catalog.js";

describe("ALERT_KINDS", () => {
  it("lists exactly the four security-fact kinds this issue delivers", () => {
    expect(ALERT_KINDS).toEqual([
      "backoffice_passkey_changed",
      "backoffice_recovery_requested",
      "user_email_changed",
      "backoffice_sign_in_lockout",
    ]);
  });
});

describe("isAlertKind", () => {
  it("accepts every catalog kind and rejects an unknown one", () => {
    for (const kind of ALERT_KINDS) {
      expect(isAlertKind(kind)).toBe(true);
    }
    expect(isAlertKind("not_a_real_kind")).toBe(false);
  });
});
