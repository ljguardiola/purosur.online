import { describe, expect, it } from "vitest";
import type { PushedEvent } from "../../sync/index.js";
import type {
  CreditNoteAnswer,
  RequestedCreditNoteAnswer,
  SaleInvoice,
  VoidCreditNoteStanding,
} from "../model/sale-credit-note.js";
import type { SaleInvoiceStanding } from "../model/sale-credit-note-route.js";
import type { PendingCreditNote } from "./request-credit-notes-ports.js";
import { requestSaleCreditNote } from "./request-sale-credit-note.js";
import { ManualClock } from "./test-support/fake-arca-vitality.js";
import {
  type CloudReply,
  FakeCloudCreditNotes,
  FakeCreditNotePrinter,
  FakeRegisterCreditNotes,
} from "./test-support/fake-register-credit-notes.js";

const NOW = new Date("2026-10-07T15:31:00.000Z");

function voidEvent(saleId: string, creditNoteId: string): PushedEvent {
  return {
    event_id: `event-${saleId}`,
    device_seq: 19,
    aggregate_type: "Sale",
    aggregate_id: saleId,
    event_type: "sale_voided",
    schema_version: 3,
    payload: { credit_note: { id: creditNoteId } },
    occurred_at: "2026-10-07T15:30:00.000Z",
    actor_id: "user-1",
    chain_hmac: `hmac-${saleId}`,
  };
}

function pendingNote(index: number): PendingCreditNote {
  return {
    creditNoteId: `credit-note-${index}`,
    saleId: `sale-${index}`,
    total: 7_500,
    receiverTaxStatusCode: 5,
    correctedVoucher: { voucherType: 11, pointOfSale: 12, number: 1_200 + index },
    origin: { kind: "sale_void" },
    saleEvent: voidEvent(`sale-${index}`, `credit-note-${index}`),
  };
}

const AUTHORIZED: CreditNoteAnswer = {
  kind: "authorized",
  pointOfSale: 12,
  number: 42,
  issuedOn: "2026-10-07",
  issuedAt: new Date("2026-10-07T15:30:58.000Z"),
  authorizationCode: "75123456789099",
  authorizationCodeDueOn: "2026-10-17",
};

const ISSUED_OFFLINE: VoidCreditNoteStanding = {
  kind: "issued_offline",
  pointOfSale: 9,
  number: 41,
  issuedOn: "2026-10-07",
  issuedAt: new Date("2026-10-07T15:30:00.000Z"),
  offlineAuthorizationCode: "71234567890123",
  fortnight: { start: "2026-10-01", end: "2026-10-15" },
};

const RETURN_ORIGIN = {
  kind: "sale_return",
  returnId: "return-1",
  issuedOn: "2026-10-07",
} as const;

function awaitingNote(): PendingCreditNote {
  return {
    creditNoteId: "credit-note-1",
    saleId: "sale-1",
    total: 3_000,
    receiverTaxStatusCode: null,
    correctedVoucher: null,
    origin: RETURN_ORIGIN,
    saleEvent: { ...voidEvent("sale-1", "credit-note-1"), event_type: "sale_returned" },
  };
}

const AUTHORIZED_INVOICE: SaleInvoice = {
  origin: "real_time",
  state: "AUTHORIZED",
  pointOfSale: 12,
  number: 1_300,
  buyerTaxStatusCode: 5,
};

function register(
  replies: CloudReply[] = [AUTHORIZED],
  {
    pointOfSale = 12 as number | null,
    pending = [pendingNote(1), pendingNote(2)],
    standings = {} as Record<string, SaleInvoiceStanding>,
  } = {},
) {
  const creditNotes = new FakeRegisterCreditNotes(pending, pointOfSale, standings);
  const cloud = new FakeCloudCreditNotes(replies);
  const printer = new FakeCreditNotePrinter();
  const run = () =>
    requestSaleCreditNote(
      { creditNotes, cloud, clock: new ManualClock(NOW), printer },
      { creditNoteId: "credit-note-1", saleId: "sale-1" },
    );
  return { creditNotes, cloud, printer, run };
}

describe("requestSaleCreditNote", () => {
  it("asks the cloud for the voided sale's credit note only, with the real-time point of sale and the event of the void", async () => {
    const { cloud, run } = register();

    await run();

    expect(cloud.calls).toEqual([
      { creditNoteId: "credit-note-1", pointOfSale: 12, saleEvent: pendingNote(1).saleEvent },
    ]);
  });

  it("records the authorized credit note, starts printing it once and answers it", async () => {
    const { creditNotes, printer, run } = register();

    expect(await run()).toEqual({ kind: "answered", answer: AUTHORIZED });
    expect(creditNotes.answered.get("credit-note-1")).toEqual({
      answer: AUTHORIZED,
      answeredAt: NOW,
    });
    expect(printer.started).toEqual(["sale-1"]);
  });

  it.each<[string, RequestedCreditNoteAnswer]>([
    ["rejected", { kind: "rejected" }],
    ["refused because its invoice already had one", { kind: "already_credited" }],
  ])("records a credit note %s and answers it, printing nothing", async (_case, reply) => {
    const { creditNotes, printer, run } = register([reply]);

    expect(await run()).toEqual({ kind: "answered", answer: reply });
    expect(creditNotes.answered.get("credit-note-1")?.answer).toEqual(reply);
    expect(printer.started).toEqual([]);
  });

  it.each<[string, CloudReply]>([
    ["no answer", null],
    ["an answer that it is still in progress", { kind: "in_progress" }],
  ])(
    "leaves the credit note in progress, recording and printing nothing, on %s",
    async (_case, reply) => {
      const { creditNotes, printer, run } = register([reply]);

      expect(await run()).toEqual({ kind: "answered", answer: { kind: "in_progress" } });
      expect(creditNotes.answered.size).toBe(0);
      expect(printer.started).toEqual([]);
    },
  );

  it("asks nothing, leaving it in progress, while the register has no real-time point of sale", async () => {
    const { cloud, printer, run } = register([AUTHORIZED], { pointOfSale: null });

    expect(await run()).toEqual({ kind: "answered", answer: { kind: "in_progress" } });
    expect(cloud.calls).toEqual([]);
    expect(printer.started).toEqual([]);
  });

  describe("an answer recorded by another request for the same credit note", () => {
    it("answers and prints the authorization recorded while it asked, keeping the first answer", async () => {
      const { creditNotes, cloud, printer, run } = register([AUTHORIZED]);
      const recordedFirstAt = new Date("2026-10-07T15:30:59.000Z");
      cloud.beforeReplying = () =>
        creditNotes.recordAnswer("credit-note-1", AUTHORIZED, recordedFirstAt);

      expect(await run()).toEqual({ kind: "answered", answer: AUTHORIZED });
      expect(creditNotes.answered.get("credit-note-1")).toEqual({
        answer: AUTHORIZED,
        answeredAt: recordedFirstAt,
      });
      expect(printer.started).toEqual(["sale-1"]);
    });

    it("answers and prints the authorization recorded while it asked, even when its own answer was unclear", async () => {
      const { creditNotes, cloud, printer, run } = register([null]);
      cloud.beforeReplying = () => creditNotes.recordAnswer("credit-note-1", AUTHORIZED, NOW);

      expect(await run()).toEqual({ kind: "answered", answer: AUTHORIZED });
      expect(printer.started).toEqual(["sale-1"]);
    });

    it("asks nothing for a credit note already answered, answering and printing what was recorded", async () => {
      const { creditNotes, cloud, printer, run } = register([AUTHORIZED]);
      await creditNotes.recordAnswer("credit-note-1", AUTHORIZED, NOW);

      expect(await run()).toEqual({ kind: "answered", answer: AUTHORIZED });
      expect(cloud.calls).toEqual([]);
      expect(printer.started).toEqual(["sale-1"]);
    });
  });

  it("answers a credit note issued offline from the register's record, printing it without asking the cloud", async () => {
    const { creditNotes, cloud, printer, run } = register([AUTHORIZED]);
    creditNotes.answered.set("credit-note-1", { answer: ISSUED_OFFLINE, answeredAt: NOW });

    expect(await run()).toEqual({ kind: "answered", answer: ISSUED_OFFLINE });
    expect(cloud.calls).toEqual([]);
    expect(printer.started).toEqual(["sale-1"]);
  });

  describe("a credit note that waits for the invoice of its sale", () => {
    const waiting = (standing: SaleInvoiceStanding, replies: CloudReply[] = [AUTHORIZED]) =>
      register(replies, { pending: [awaitingNote()], standings: { "sale-1": standing } });
    const INVOICED = { fiscalDocuments: [AUTHORIZED_INVOICE], deferralPending: false };

    it("ties the credit note to the invoice the sale got and asks the cloud for it, with that invoice", async () => {
      const { creditNotes, cloud, run } = waiting(INVOICED);

      expect(await run()).toEqual({ kind: "answered", answer: AUTHORIZED });
      expect(creditNotes.tied.get("credit-note-1")).toEqual({
        voucher: { voucherType: 11, pointOfSale: 12, number: 1_300 },
        buyerTaxStatusCode: 5,
      });
      expect(cloud.calls).toEqual([
        {
          creditNoteId: "credit-note-1",
          pointOfSale: 12,
          saleEvent: awaitingNote().saleEvent,
          invoice: {
            voucher: { voucherType: 11, pointOfSale: 12, number: 1_300 },
            buyerTaxStatusCode: 5,
          },
        },
      ]);
    });

    it("asks nothing, leaving it in progress, while the invoice is on its way", async () => {
      const { creditNotes, cloud, run } = waiting({ fiscalDocuments: [], deferralPending: true });

      expect(await run()).toEqual({ kind: "answered", answer: { kind: "in_progress" } });
      expect(creditNotes.tied.size).toBe(0);
      expect(cloud.calls).toEqual([]);
    });

    it("answers that a person must regularize it when no invoice is on its way", async () => {
      const { creditNotes, cloud, printer, run } = waiting({
        fiscalDocuments: [],
        deferralPending: false,
      });

      expect(await run()).toEqual({
        kind: "answered",
        answer: { kind: "regularization_required" },
      });
      expect(creditNotes.answered.get("credit-note-1")).toEqual({
        answer: { kind: "regularization_required" },
        answeredAt: NOW,
      });
      expect(cloud.calls).toEqual([]);
      expect(printer.started).toEqual([]);
    });

    it("records and answers that a person must regularize it when the cloud says so", async () => {
      const { creditNotes, printer, run } = waiting(INVOICED, [
        { kind: "regularization_required" },
      ]);

      expect(await run()).toEqual({
        kind: "answered",
        answer: { kind: "regularization_required" },
      });
      expect(creditNotes.answered.get("credit-note-1")?.answer).toEqual({
        kind: "regularization_required",
      });
      expect(printer.started).toEqual([]);
    });

    it("does not look for an invoice for a credit note that already corrects one", async () => {
      const { creditNotes, run } = register([AUTHORIZED]);

      await run();

      expect(creditNotes.standingLookups).toEqual([]);
    });
  });

  it("leaves the credit note in progress, printing nothing, and gives the failure when asking for it fails", async () => {
    const { cloud, creditNotes, printer, run } = register();
    const failure = new Error("the cloud client broke");
    cloud.failure = failure;

    expect(await run()).toEqual({
      kind: "failed",
      answer: { kind: "in_progress" },
      error: failure,
    });
    expect(creditNotes.answered.size).toBe(0);
    expect(printer.started).toEqual([]);
  });
});
