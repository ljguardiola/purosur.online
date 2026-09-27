import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ALERT_KINDS, isAlertKind } from "./alert-catalog.js";

describe("ALERT_KINDS", () => {
  it("lists exactly the four security-fact kinds a backoffice account can raise", () => {
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

  it("rejects any string outside the catalog and any non-string value", () => {
    fc.assert(
      fc.property(fc.anything(), (value) => {
        fc.pre(!(typeof value === "string" && (ALERT_KINDS as readonly string[]).includes(value)));
        expect(isAlertKind(value)).toBe(false);
      }),
    );
  });
});
