import { describe, expect, it } from "vitest";
import { ARCA_CERTIFICATE_EXPIRY_ESCALATION_MS } from "../../fiscal/index.js";
import {
  ALERT_ESCALATION_CHECK_INTERVAL_MS,
  ESCALATED_LEVEL,
  escalatesAt,
  isDueForEscalation,
} from "./alert-escalation.js";
import {
  ALERT_ESCALATION_DELAY_MS,
  FISCAL_UNKNOWN_ESCALATION_DELAY_MS,
  LATE_PAYMENT_REFUND_ESCALATION_DELAY_MS,
  REFUND_TASK_ESCALATION_DELAY_MS,
} from "./alert-kind-policy.js";

const OPENED = new Date("2026-10-01T08:00:00.000Z");
const DUE = new Date(OPENED.getTime() + ALERT_ESCALATION_DELAY_MS);

describe("escalatesAt", () => {
  it("is the escalation delay after the alert opened, for a kind that escalates after opening", () => {
    expect(
      escalatesAt(
        {
          kind: "backoffice_passkey_changed",
          scope: "user-1",
          detail: { action: "removed", passkeyName: "Laptop", actorId: "user-1", via: "self" },
        },
        OPENED,
      ),
    ).toEqual(DUE);
  });

  it("is 72 hours after a late-payment refund alert opened, not 24", () => {
    const escalation = escalatesAt(
      {
        kind: "late_payment_refund",
        scope: "refund-1",
        locationId: "branch-1",
        detail: { saleId: "sale-1", amount: 2500, providerOrderId: null },
      },
      OPENED,
    );

    expect(escalation).toEqual(
      new Date(OPENED.getTime() + LATE_PAYMENT_REFUND_ESCALATION_DELAY_MS),
    );
    expect(escalation).not.toEqual(DUE);
  });

  it("is 72 hours after the refund opened for a forgotten refund, whenever its alert opened", () => {
    const refundOpenedAt = new Date("2026-09-30T08:00:00.000Z");
    const alertOpenedAt = new Date("2026-10-01T09:00:00.000Z");

    expect(
      escalatesAt(
        {
          kind: "refund_task",
          scope: "refund-1",
          locationId: "branch-1",
          detail: {
            saleId: "sale-1",
            amount: 12400,
            method: "TRANSFER",
            refundOpenedAt: refundOpenedAt.toISOString(),
          },
        },
        alertOpenedAt,
      ),
    ).toEqual(new Date(refundOpenedAt.getTime() + REFUND_TASK_ESCALATION_DELAY_MS));
  });

  it("is 30 minutes after the document became unclear for an unclear document, whenever its alert opened", () => {
    const unclearSince = new Date("2026-10-01T07:50:00.000Z");

    expect(
      escalatesAt(
        {
          kind: "fiscal_unknown",
          scope: "document-1",
          detail: {
            fiscalDocumentId: "document-1",
            saleId: "sale-1",
            registerId: "register-1",
            pointOfSale: 12,
            number: 41,
            unclearSince: unclearSince.toISOString(),
          },
        },
        OPENED,
      ),
    ).toEqual(new Date(unclearSince.getTime() + FISCAL_UNKNOWN_ESCALATION_DELAY_MS));
  });

  it("is never, for a kind that opens already critical", () => {
    expect(
      escalatesAt(
        {
          kind: "user_access_increased",
          scope: "user-1",
          detail: { cause: "created_as_administrator", actorId: "user-2" },
        },
        OPENED,
      ),
    ).toBeNull();
  });

  it("is the escalation lead before the deadline in the detail, for a kind that escalates before a deadline", () => {
    const notAfter = new Date("2026-11-20T15:30:00.000Z");
    expect(
      escalatesAt(
        {
          kind: "arca_certificate_expiring",
          scope: "homologation",
          detail: { notAfter: notAfter.toISOString() },
        },
        OPENED,
      ),
    ).toEqual(new Date(notAfter.getTime() - ARCA_CERTIFICATE_EXPIRY_ESCALATION_MS));
  });
});

describe("isDueForEscalation", () => {
  const warning = { level: "warning", resolvedAt: null, escalateAt: DUE } as const;
  const justBefore = new Date(DUE.getTime() - 1);
  const justAfter = new Date(DUE.getTime() + 1);

  it("is due from the escalation moment on", () => {
    expect(isDueForEscalation(warning, justBefore)).toBe(false);
    expect(isDueForEscalation(warning, DUE)).toBe(true);
    expect(isDueForEscalation(warning, justAfter)).toBe(true);
  });

  it("is never due once closed", () => {
    expect(isDueForEscalation({ ...warning, resolvedAt: OPENED }, justAfter)).toBe(false);
  });

  it("is only due while still a warning", () => {
    expect(isDueForEscalation({ ...warning, level: "critical" }, justAfter)).toBe(false);
    expect(isDueForEscalation({ ...warning, level: "informational" }, justAfter)).toBe(false);
  });

  it("is never due without an escalation moment", () => {
    expect(isDueForEscalation({ ...warning, escalateAt: null }, justAfter)).toBe(false);
  });
});

describe("ESCALATED_LEVEL", () => {
  it("is critical", () => {
    expect(ESCALATED_LEVEL).toBe("critical");
  });
});

describe("ALERT_ESCALATION_CHECK_INTERVAL_MS", () => {
  it("is 5 minutes", () => {
    expect(ALERT_ESCALATION_CHECK_INTERVAL_MS).toBe(5 * 60 * 1000);
  });
});
