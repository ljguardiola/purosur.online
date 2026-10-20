import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  ALERT_AUDIENCES,
  ALERT_KINDS,
  ALERT_LEVELS,
  isAlertKind,
  isAlertLevel,
  isHigherAlertLevel,
} from "./alert-catalog.js";

describe("ALERT_KINDS", () => {
  it("lists exactly the security-fact kinds a backoffice account, a register enrollment, the application of synced events, the ARCA certificate or a register's version, silence or inability to sell or the tax authority's rejection of a document, a branch's lots nearing expiry, or a point of sale's fortnight report can raise", () => {
    expect(ALERT_KINDS).toEqual([
      "backoffice_passkey_changed",
      "backoffice_recovery_requested",
      "user_email_changed",
      "backoffice_sign_in_lockout",
      "user_access_increased",
      "register_enrolled",
      "events_quarantined",
      "event_invariant_violated",
      "arca_certificate_expiring",
      "arca_wsaa_ticket_held",
      "update_required",
      "register_silent",
      "sales_denied",
      "fiscal_rejected",
      "offline_authorization_code_missing",
      "late_payment_refund",
      "refund_task",
      "fiscal_unknown",
      "fiscal_emission_stopped",
      "clock_drift",
      "outbox_chain_broken",
      "lots_expiring",
      "offsite_dump_unverified",
      "fortnight_report_pending",
      "fortnight_report_overdue",
      "external_billing",
      "fortnight_report_needs_regularization",
      "clock_corrected",
      "invoice_already_credited",
      "fortnight_report_owed_elsewhere",
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

describe("isAlertLevel", () => {
  it("accepts every level and rejects an unknown one", () => {
    for (const level of ALERT_LEVELS) {
      expect(isAlertLevel(level)).toBe(true);
    }
    expect(isAlertLevel("urgent")).toBe(false);
  });

  it("rejects any string that is not a level and any non-string value", () => {
    fc.assert(
      fc.property(fc.anything(), (value) => {
        fc.pre(!(typeof value === "string" && (ALERT_LEVELS as readonly string[]).includes(value)));
        expect(isAlertLevel(value)).toBe(false);
      }),
    );
  });
});

describe("isHigherAlertLevel", () => {
  it("ranks a warning above an informational alert and a critical one above a warning", () => {
    expect(isHigherAlertLevel("warning", "informational")).toBe(true);
    expect(isHigherAlertLevel("critical", "warning")).toBe(true);
    expect(isHigherAlertLevel("critical", "informational")).toBe(true);
  });

  it("does not rank a level above itself or above a more urgent one", () => {
    for (const level of ALERT_LEVELS) {
      expect(isHigherAlertLevel(level, level)).toBe(false);
    }
    expect(isHigherAlertLevel("informational", "warning")).toBe(false);
    expect(isHigherAlertLevel("warning", "critical")).toBe(false);
    expect(isHigherAlertLevel("informational", "critical")).toBe(false);
  });
});

describe("ALERT_AUDIENCES", () => {
  it("lists who an alert can be for: a branch's own holders or every holder", () => {
    expect(ALERT_AUDIENCES).toEqual(["local", "all"]);
  });
});
