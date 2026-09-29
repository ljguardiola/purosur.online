import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ALERT_AUDIENCES, ALERT_KINDS, ALERT_LEVELS, isAlertKind } from "./alert-catalog.js";

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

describe("ALERT_LEVELS", () => {
  it("lists every level an alert can have, from the least to the most urgent", () => {
    expect(ALERT_LEVELS).toEqual(["informational", "warning", "critical"]);
  });
});

describe("ALERT_AUDIENCES", () => {
  it("lists who an alert can be for: a branch's own holders or every holder", () => {
    expect(ALERT_AUDIENCES).toEqual(["local", "all"]);
  });
});
