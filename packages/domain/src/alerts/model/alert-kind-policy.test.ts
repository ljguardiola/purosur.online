import { describe, expect, it } from "vitest";
import { ARCA_CERTIFICATE_EXPIRY_ESCALATION_MS } from "../../fiscal/index.js";
import { ALERT_KINDS } from "./alert-catalog.js";
import {
  ALERT_CLOSINGS,
  ALERT_ESCALATION_DELAY_MS,
  alertClosing,
  alertKindPolicy,
  alertKindsWithScope,
  LATE_PAYMENT_REFUND_ESCALATION_DELAY_MS,
  REFUND_TASK_ALERT_OPENING_DELAY_MS,
  REFUND_TASK_ESCALATION_DELAY_MS,
} from "./alert-kind-policy.js";

describe("alertKindPolicy", () => {
  it("escalates after 24 hours", () => {
    expect(ALERT_ESCALATION_DELAY_MS).toBe(24 * 60 * 60 * 1000);
  });

  it("escalates a late-payment refund after 72 hours", () => {
    expect(LATE_PAYMENT_REFUND_ESCALATION_DELAY_MS).toBe(72 * 60 * 60 * 1000);
  });

  it("opens the alert of a forgotten refund after 24 hours and escalates it 72 hours after the refund opened", () => {
    expect(REFUND_TASK_ALERT_OPENING_DELAY_MS).toBe(24 * 60 * 60 * 1000);
    expect(REFUND_TASK_ESCALATION_DELAY_MS).toBe(72 * 60 * 60 * 1000);
  });

  const afterOpening = { kind: "afterOpening", delayMs: ALERT_ESCALATION_DELAY_MS } as const;

  it.each([
    ["backoffice_passkey_changed", "warning", afterOpening, "all", "user", true],
    ["backoffice_recovery_requested", "warning", afterOpening, "all", "user", true],
    ["user_email_changed", "warning", afterOpening, "all", "user", true],
    ["backoffice_sign_in_lockout", "warning", afterOpening, "all", "sourceAddress", true],
    ["user_access_increased", "critical", null, "all", "user", false],
    ["register_enrolled", "warning", afterOpening, "all", "register", false],
    [
      "arca_certificate_expiring",
      "warning",
      { kind: "beforeDeadline", leadMs: ARCA_CERTIFICATE_EXPIRY_ESCALATION_MS },
      "all",
      "environment",
      true,
    ],
    ["arca_wsaa_ticket_held", "warning", null, "all", "environment", true],
    ["events_quarantined", "warning", afterOpening, "all", "event", true],
    ["event_invariant_violated", "warning", afterOpening, "all", "event", true],
    ["update_required", "critical", null, "all", "register", true],
    ["register_silent", "critical", null, "local", "register", true],
    ["sales_denied", "critical", null, "local", "register", true],
    ["fiscal_rejected", "critical", null, "all", "pointOfSaleDocumentType", true],
    ["offline_authorization_code_missing", "informational", null, "all", "registerFortnight", true],
    [
      "late_payment_refund",
      "warning",
      { kind: "afterOpening", delayMs: LATE_PAYMENT_REFUND_ESCALATION_DELAY_MS },
      "local",
      "refund",
      true,
    ],
    [
      "refund_task",
      "warning",
      { kind: "afterSubjectOpening", delayMs: REFUND_TASK_ESCALATION_DELAY_MS },
      "local",
      "refund",
      true,
    ],
  ] as const)(
    "%s opens as %s, escalates %o, is shown to %s, is scoped to %s and deduplicates: %s",
    (kind, level, escalation, audience, scopeKind, deduplicates) => {
      expect(alertKindPolicy(kind)).toMatchObject({
        level,
        escalation,
        audience,
        scopeKind,
        deduplicates,
      });
    },
  );

  it("resolves after its condition stays cleared only for the kinds that track an ongoing condition", () => {
    const stable = ALERT_KINDS.filter((kind) => alertKindPolicy(kind).resolvesAfterStableClear);

    expect(stable).toEqual([
      "update_required",
      "register_silent",
      "sales_denied",
      "fiscal_rejected",
      "offline_authorization_code_missing",
    ]);
  });

  it("answers for every alert kind", () => {
    for (const kind of ALERT_KINDS) {
      expect(alertKindPolicy(kind)).toBeDefined();
    }
  });
});

describe("alertClosing", () => {
  it("closes by itself an alert whose condition stays cleared, with its refund an alert scoped to a refund, and every other by hand", () => {
    const closings = Object.fromEntries(ALERT_KINDS.map((kind) => [kind, alertClosing(kind)]));

    expect(closings).toEqual({
      backoffice_passkey_changed: "by_hand",
      backoffice_recovery_requested: "by_hand",
      user_email_changed: "by_hand",
      backoffice_sign_in_lockout: "by_hand",
      user_access_increased: "by_hand",
      register_enrolled: "by_hand",
      events_quarantined: "by_hand",
      event_invariant_violated: "by_hand",
      arca_certificate_expiring: "by_hand",
      arca_wsaa_ticket_held: "by_hand",
      update_required: "by_itself",
      register_silent: "by_itself",
      sales_denied: "by_itself",
      fiscal_rejected: "by_itself",
      offline_authorization_code_missing: "by_itself",
      late_payment_refund: "with_its_refund",
      refund_task: "with_its_refund",
    });
  });

  it("lists every way an alert closes", () => {
    expect(ALERT_CLOSINGS).toEqual(["by_itself", "with_its_refund", "by_hand"]);
  });
});

describe("alertKindsWithScope", () => {
  it("lists the kinds scoped to the given kind of scope, in catalog order", () => {
    expect(alertKindsWithScope("user")).toEqual([
      "backoffice_passkey_changed",
      "backoffice_recovery_requested",
      "user_email_changed",
      "user_access_increased",
    ]);
    expect(alertKindsWithScope("sourceAddress")).toEqual(["backoffice_sign_in_lockout"]);
    expect(alertKindsWithScope("register")).toEqual([
      "register_enrolled",
      "update_required",
      "register_silent",
      "sales_denied",
    ]);
    expect(alertKindsWithScope("event")).toEqual([
      "events_quarantined",
      "event_invariant_violated",
    ]);
    expect(alertKindsWithScope("pointOfSaleDocumentType")).toEqual(["fiscal_rejected"]);
    expect(alertKindsWithScope("environment")).toEqual([
      "arca_certificate_expiring",
      "arca_wsaa_ticket_held",
    ]);
    expect(alertKindsWithScope("registerFortnight")).toEqual([
      "offline_authorization_code_missing",
    ]);
    expect(alertKindsWithScope("refund")).toEqual(["late_payment_refund", "refund_task"]);
  });
});
