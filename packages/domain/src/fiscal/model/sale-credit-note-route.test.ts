import { describe, expect, it } from "vitest";
import type { OutboxEventDraft } from "../../shared/index.js";
import type { FiscalOnlineSignalEvidence } from "./fiscal-online-signal.js";
import type { OfflineCreditNote } from "./offline-fiscal-document.js";
import type { CorrectedInvoice } from "./sale-credit-note.js";
import {
  type CreditNoteRecorder,
  type CreditNoteRoutingFacts,
  isInvoiceOnItsWay,
  issueOfflineSaleCreditNote,
  type OfflineCreditNoteClockMark,
  routeSaleCreditNote,
} from "./sale-credit-note-route.js";

const NOW = new Date("2026-10-07T15:30:00.000Z");
const CODE = "71234567890123";
const INVOICE: CorrectedInvoice = {
  voucher: { voucherType: 11, pointOfSale: 3, number: 1204 },
  buyerTaxStatusCode: 5,
};
const SERIES = {
  pointOfSale: 9,
  blocksInAssignmentOrder: [{ firstNumber: 41, lastNumber: 1040 }],
  localLastUsed: null,
  taxAuthorityLastAuthorized: 40,
  highestSyncedNumber: null,
  clockMark: null,
};
const ONLINE = {
  lastHealthCheckOkAt: new Date(NOW.getTime() - 1_000),
  tokenValid: true,
  arcaReachable: true,
};
const OFFLINE = { ...ONLINE, lastHealthCheckOkAt: null };

function facts(
  changes: Partial<CreditNoteRoutingFacts> = {},
  evidence: FiscalOnlineSignalEvidence = ONLINE,
) {
  const reads: string[] = [];
  const routing: CreditNoteRoutingFacts = {
    fiscalOnlineEvidence: () => {
      reads.push("evidence");
      return evidence;
    },
    offlineCreditNoteSeries: () => {
      reads.push("series");
      return SERIES;
    },
    offlineAuthorizationCodeOf: () => {
      reads.push("code");
      return CODE;
    },
    ...changes,
  };
  return { routing, reads };
}

function route(
  routing: CreditNoteRoutingFacts,
  input: Partial<Parameters<typeof routeSaleCreditNote>[0]> = {},
) {
  let issued = 0;
  return routeSaleCreditNote(
    {
      occurredAt: NOW,
      saleId: "sale-1",
      total: 6750,
      origin: { kind: "sale_void" },
      invoice: INVOICE,
      invoiceOnItsWay: false,
      nextCreditNoteId: () => `credit-note-${++issued}`,
      ...input,
    },
    routing,
  );
}

const INVOICED_NOTE = {
  creditNoteId: "credit-note-1",
  saleId: "sale-1",
  total: 6750,
  receiverTaxStatusCode: 5,
  correctedVoucher: { voucherType: 11, pointOfSale: 3, number: 1204 },
};

describe("routeSaleCreditNote", () => {
  it("asks the cloud for the credit note of a void that has an invoice while the register is online", () => {
    const { routing } = facts();

    expect(route(routing)).toEqual({
      kind: "pending",
      creditNote: { ...INVOICED_NOTE, origin: { kind: "sale_void" } },
    });
  });

  it("dates the credit note of a return with the Argentine day of the return", () => {
    const occurredAt = new Date("2026-10-08T01:30:00.000Z");
    const { routing } = facts(
      {},
      { ...ONLINE, lastHealthCheckOkAt: new Date(occurredAt.getTime() - 1_000) },
    );

    expect(
      route(routing, {
        occurredAt,
        origin: { kind: "sale_return", returnId: "return-1" },
      }),
    ).toMatchObject({
      kind: "pending",
      creditNote: { origin: { kind: "sale_return", returnId: "return-1", issuedOn: "2026-10-07" } },
    });
  });

  it("issues no credit note for an amount of nothing", () => {
    const { routing, reads } = facts();

    expect(route(routing, { total: 0 })).toEqual({ kind: "none" });
    expect(reads).toEqual([]);
  });

  it("issues no credit note for a sale without an invoice that no invoice is on its way to", () => {
    const { routing } = facts();

    expect(route(routing, { invoice: null })).toEqual({ kind: "none" });
  });

  it("holds a credit note for the invoice of a sale that is about to be invoiced", () => {
    const { routing, reads } = facts({}, OFFLINE);

    expect(
      route(routing, {
        invoice: null,
        invoiceOnItsWay: true,
        origin: { kind: "sale_return", returnId: "return-1" },
      }),
    ).toEqual({
      kind: "awaiting_invoice",
      creditNote: {
        creditNoteId: "credit-note-1",
        saleId: "sale-1",
        total: 6750,
        receiverTaxStatusCode: null,
        correctedVoucher: null,
        origin: { kind: "sale_return", returnId: "return-1", issuedOn: "2026-10-07" },
      },
    });
    expect(reads).toEqual([]);
  });

  it("takes an id for the credit note only when there is one", () => {
    const { routing } = facts();
    let taken = 0;

    route(routing, { total: 0, nextCreditNoteId: () => `id-${++taken}` });
    route(routing, { invoice: null, nextCreditNoteId: () => `id-${++taken}` });

    expect(taken).toBe(0);
  });

  describe("without a connection", () => {
    const offline = (changes: Partial<CreditNoteRoutingFacts> = {}) => facts(changes, OFFLINE);

    it("issues the credit note offline in the next number of the credit note series", () => {
      const { routing } = offline();

      expect(route(routing)).toEqual({
        kind: "issue_offline",
        creditNote: { ...INVOICED_NOTE, origin: { kind: "sale_void" } },
        offline: {
          pointOfSale: 9,
          number: 41,
          issuedOn: "2026-10-07",
          fortnight: { start: "2026-10-01", end: "2026-10-15" },
          offlineAuthorizationCode: CODE,
        },
        clockMark: { pointOfSale: 9, documentType: "credit_note_c", reading: NOW },
      });
    });

    it("raises the mark of the series to the moment of the operation", () => {
      const earlier = new Date(NOW.getTime() - 30_000);
      const { routing } = offline({
        offlineCreditNoteSeries: () => ({ ...SERIES, clockMark: earlier }),
      });

      expect(route(routing)).toMatchObject({ clockMark: { reading: NOW } });
    });

    it.each([
      ["the register holds no number block", { blocksInAssignmentOrder: [] }],
      ["the block is used up", { localLastUsed: 1040 }],
      ["the clock is behind the series' mark", { clockMark: new Date(NOW.getTime() + 61_000) }],
    ])("leaves the credit note for the cloud when %s", (_case, series) => {
      const { routing } = offline({
        offlineCreditNoteSeries: () => ({ ...SERIES, ...series }),
      });

      expect(route(routing)).toMatchObject({ kind: "pending" });
    });

    it("leaves the credit note for the cloud when the fortnight has no contingency code", () => {
      const { routing } = offline({ offlineAuthorizationCodeOf: () => null });

      expect(route(routing)).toMatchObject({ kind: "pending" });
    });

    it("reads the series and the code only when it is offline with a credit note to issue", () => {
      const online = facts();
      const none = offline();
      const issued = offline();

      route(online.routing);
      route(none.routing, { invoice: null });
      route(issued.routing);

      expect(online.reads).toEqual(["evidence"]);
      expect(none.reads).toEqual([]);
      expect(issued.reads).toEqual(["evidence", "series", "code"]);
    });

    it("tells whether the register is online by the clock of the operation", () => {
      const { routing } = facts();

      expect(route(routing, { occurredAt: new Date(NOW.getTime() + 3_600_000) })).toMatchObject({
        kind: "issue_offline",
      });
    });
  });
});

describe("isInvoiceOnItsWay", () => {
  const document = (state: "AUTHORIZED" | "REQUESTING" | "REJECTED") => ({
    origin: "real_time" as const,
    state,
    pointOfSale: 3,
    number: 1204,
    buyerTaxStatusCode: 5,
  });

  it("is true while the sale is deferred and not yet invoiced", () => {
    expect(isInvoiceOnItsWay({ fiscalDocuments: [], deferralPending: true })).toBe(true);
  });

  it("is true while an invoice request is in flight", () => {
    expect(
      isInvoiceOnItsWay({ fiscalDocuments: [document("REQUESTING")], deferralPending: false }),
    ).toBe(true);
  });

  it.each([
    ["a sale with no documents", []],
    ["a rejected invoice", [document("REJECTED")]],
    ["an authorized invoice", [document("AUTHORIZED")]],
  ])("is false for %s that is not deferred", (_case, fiscalDocuments) => {
    expect(isInvoiceOnItsWay({ fiscalDocuments, deferralPending: false })).toBe(false);
  });
});

describe("issueOfflineSaleCreditNote", () => {
  const GENERATED_AT = new Date("2026-10-07T15:30:02.000Z");
  const ISSUANCE = {
    kind: "issue_offline" as const,
    creditNote: {
      ...INVOICED_NOTE,
      origin: { kind: "sale_return" as const, returnId: "return-1", issuedOn: "2026-10-07" },
    },
    offline: {
      pointOfSale: 9,
      number: 41,
      issuedOn: "2026-10-07",
      fortnight: { start: "2026-10-01", end: "2026-10-15" },
      offlineAuthorizationCode: CODE,
    },
    clockMark: { pointOfSale: 9, documentType: "credit_note_c" as const, reading: NOW },
  };

  function issue() {
    const steps: string[] = [];
    const recorded: {
      documents: OfflineCreditNote[];
      marks: OfflineCreditNoteClockMark[];
      events: OutboxEventDraft[];
    } = { documents: [], marks: [], events: [] };
    const recorder: CreditNoteRecorder = {
      recordPendingCreditNote: () => {
        steps.push("pending");
      },
      issueOfflineCreditNote: (document) => {
        steps.push("document");
        recorded.documents.push(document);
      },
      recordClockMark: (mark) => {
        steps.push("clock mark");
        recorded.marks.push(mark);
      },
      appendOutboxEvent: (draft) => {
        steps.push("event");
        recorded.events.push(draft);
      },
    };
    let taken = 0;
    issueOfflineSaleCreditNote(ISSUANCE, recorder, {
      nextId: () => `id-${++taken}`,
      registerId: "register-1",
      actorId: "user-1",
      generatedAt: GENERATED_AT,
    });
    return { steps, recorded };
  }

  it("holds the credit note C in the number it was routed to, correcting the invoice, for the whole credit", () => {
    expect(issue().recorded.documents).toEqual([
      {
        id: "id-1",
        saleId: "sale-1",
        creditNoteId: "credit-note-1",
        pointOfSale: 9,
        documentType: "credit_note_c",
        number: 41,
        issuedOn: "2026-10-07",
        generatedAt: GENERATED_AT,
        generationStamp: "20261007123002",
        offlineAuthorizationCode: CODE,
        fortnight: { start: "2026-10-01", end: "2026-10-15" },
        total: 6750,
        receiverTaxStatusCode: 5,
        corrects: { voucherType: 11, pointOfSale: 3, number: 1204 },
        buyerDocumentType: 99,
        buyerDocumentNumber: 0,
        cause: "no_connectivity",
      },
    ]);
  });

  it("raises the series' clock mark to the reading it was routed with", () => {
    expect(issue().recorded.marks).toEqual([ISSUANCE.clockMark]);
  });

  it("tells the cloud about the document in an event of its own id, naming the register and who issued it", () => {
    expect(issue().recorded.events).toEqual([
      expect.objectContaining({
        event_id: "id-2",
        aggregate_type: "Sale",
        aggregate_id: "sale-1",
        event_type: "offline_fiscal_document_issued",
        actor_id: "user-1",
        payload: expect.objectContaining({
          fiscal_document_id: "id-1",
          register_id: "register-1",
          credit_note_id: "credit-note-1",
          number: 41,
        }),
      }),
    ]);
  });

  it("holds the document, then raises the mark, then tells the cloud, holding nothing for the cloud to issue", () => {
    expect(issue().steps).toEqual(["document", "clock mark", "event"]);
  });
});
