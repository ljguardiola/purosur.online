import { describe, expect, it } from "vitest";
import { detectRejectedFortnightDocuments } from "./detect-rejected-fortnight-documents.js";
import type { RejectedFortnightDocument } from "./rejected-fortnight-document-ports.js";
import {
  FakeRejectedFortnightDocumentAlerts,
  FakeRejectedFortnightDocumentReader,
} from "./test-support/fake-rejected-fortnight-documents.js";

const FIRST_HALF = { start: "2026-09-01", end: "2026-09-15" };
const SECOND_HALF = { start: "2026-09-16", end: "2026-09-30" };

function rejected(
  pointOfSaleNumber: number,
  fortnight = FIRST_HALF,
  rejectedNumber = 12,
): RejectedFortnightDocument {
  return {
    pointOfSaleNumber,
    registerId: `register-${pointOfSaleNumber}`,
    fortnight,
    documentType: "factura_c",
    rejectedNumber,
  };
}

function holds(pointOfSaleNumber: number, fortnight = FIRST_HALF, rejectedNumber = 12) {
  return {
    holds: true,
    alert: {
      kind: "fortnight_report_document_rejected",
      scope: `${pointOfSaleNumber}:${fortnight.start}:factura_c`,
      detail: {
        pointOfSaleNumber,
        registerId: `register-${pointOfSaleNumber}`,
        fortnightStart: fortnight.start,
        fortnightEnd: fortnight.end,
        documentType: "factura_c",
        rejectedNumber,
      },
    },
  };
}

function detect(
  presentations: RejectedFortnightDocument[],
  alerts = new FakeRejectedFortnightDocumentAlerts(),
) {
  return {
    alerts,
    outcome: detectRejectedFortnightDocuments({
      presentations: new FakeRejectedFortnightDocumentReader(presentations),
      alerts,
    }),
  };
}

describe("detectRejectedFortnightDocuments", () => {
  it("observes the condition of each presentation awaiting the remedy of a rejected document, naming it, and counts them", async () => {
    const { alerts, outcome } = detect([rejected(9), rejected(8, SECOND_HALF, 40)]);

    await expect(outcome).resolves.toBe(2);
    expect(alerts.observations).toEqual([holds(9), holds(8, SECOND_HALF, 40)]);
  });

  it("observes a presentation listed twice once", async () => {
    const { alerts, outcome } = detect([rejected(9), rejected(9, { ...FIRST_HALF })]);

    await expect(outcome).resolves.toBe(1);
    expect(alerts.observations).toEqual([holds(9)]);
  });

  it("clears the condition of a scope that no longer awaits a remedy and keeps the ones that still do", async () => {
    const { alerts, outcome } = detect(
      [rejected(9)],
      new FakeRejectedFortnightDocumentAlerts(["9:2026-09-01:factura_c", "8:2026-09-16:factura_c"]),
    );

    await expect(outcome).resolves.toBe(1);
    expect(alerts.observations).toEqual([
      holds(9),
      {
        holds: false,
        kind: "fortnight_report_document_rejected",
        scope: "8:2026-09-16:factura_c",
      },
    ]);
  });

  it("clears every alert when no presentation awaits a remedy", async () => {
    const { alerts, outcome } = detect(
      [],
      new FakeRejectedFortnightDocumentAlerts(["9:2026-09-01:factura_c"]),
    );

    await expect(outcome).resolves.toBe(0);
    expect(alerts.observations).toEqual([
      {
        holds: false,
        kind: "fortnight_report_document_rejected",
        scope: "9:2026-09-01:factura_c",
      },
    ]);
  });

  it("observes nothing when no presentation awaits a remedy and no alert is open", async () => {
    const { alerts, outcome } = detect([]);

    await expect(outcome).resolves.toBe(0);
    expect(alerts.observations).toEqual([]);
  });
});
