import { describe, expect, it } from "vitest";
import type {
  CreditNoteAnswer,
  SaleInvoice,
  VoidCreditNoteStanding,
} from "../model/sale-credit-note.js";
import type { SaleInvoiceStanding } from "../model/sale-credit-note-route.js";
import type { InvoiceDeferredSalesUpToOutcome } from "./invoice-deferred-sales-up-to.js";
import type { PendingCreditNote } from "./request-credit-notes-ports.js";
import {
  type ReturnCreditNoteToRequest,
  requestReturnCreditNote,
} from "./request-return-credit-note.js";
import { ManualClock } from "./test-support/fake-arca-vitality.js";
import {
  FakeCloudCreditNotes,
  FakeCreditNotePrinter,
  FakeRegisterCreditNotes,
} from "./test-support/fake-register-credit-notes.js";

const NOW = new Date("2026-10-07T15:31:00.000Z");

const RETURN_EVENT = {
  event_id: "event-return-1",
  device_seq: 19,
  aggregate_type: "Return",
  aggregate_id: "return-1",
  event_type: "sale_returned",
  schema_version: 2,
  payload: { credit_note: { id: "credit-note-1" } },
  occurred_at: "2026-10-07T15:30:00.000Z",
  actor_id: "user-1",
  chain_hmac: "hmac-return-1",
};

const RETURN_ORIGIN = {
  kind: "sale_return",
  returnId: "return-1",
  issuedOn: "2026-10-07",
} as const;

const INVOICE = { voucherType: 11, pointOfSale: 12, number: 1_300 };

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

const AUTHORIZED_INVOICE: SaleInvoice = {
  origin: "real_time",
  state: "AUTHORIZED",
  pointOfSale: 12,
  number: 1_300,
  buyerTaxStatusCode: 5,
};

const AWAITING_NOTE: PendingCreditNote = {
  creditNoteId: "credit-note-1",
  saleId: "sale-1",
  total: 3_000,
  receiverTaxStatusCode: null,
  correctedVoucher: null,
  origin: RETURN_ORIGIN,
  saleEvent: RETURN_EVENT,
};

const INVOICED_NOTE: PendingCreditNote = {
  ...AWAITING_NOTE,
  receiverTaxStatusCode: 5,
  correctedVoucher: INVOICE,
};

function register(note: PendingCreditNote, standing: SaleInvoiceStanding) {
  const steps: string[] = [];
  const standings: Record<string, SaleInvoiceStanding> = { "sale-1": standing };
  const creditNotes = new FakeRegisterCreditNotes([note], 12, standings);
  const cloud = new FakeCloudCreditNotes([AUTHORIZED]);
  cloud.beforeReplying = async () => {
    steps.push("cloud");
  };
  const printer = new FakeCreditNotePrinter();
  let catchUp: () => Promise<InvoiceDeferredSalesUpToOutcome> = async () => {
    standings["sale-1"] = { fiscalDocuments: [AUTHORIZED_INVOICE], deferralPending: false };
    return { kind: "invoiced" };
  };
  const invoicing = {
    invoiceUpTo: async (saleId: string) => {
      steps.push(`catch-up:${saleId}`);
      return catchUp();
    },
  };
  return {
    steps,
    creditNotes,
    cloud,
    printer,
    onCatchUp(answer: () => Promise<InvoiceDeferredSalesUpToOutcome>) {
      catchUp = answer;
    },
    run: (creditNote: ReturnCreditNoteToRequest) =>
      requestReturnCreditNote(
        { creditNotes, cloud, clock: new ManualClock(NOW), printer, invoicing },
        { saleId: "sale-1", creditNote },
      ),
  };
}

const DEFERRED = { fiscalDocuments: [], deferralPending: true };
const INVOICED = { fiscalDocuments: [AUTHORIZED_INVOICE], deferralPending: false };

describe("requestReturnCreditNote", () => {
  it("invoices the deferred sale first, then asks the cloud for the credit note of the invoice it issued", async () => {
    const { steps, cloud, run } = register(AWAITING_NOTE, DEFERRED);

    const outcome = await run({ kind: "awaiting_invoice", creditNoteId: "credit-note-1" });

    expect(steps).toEqual(["catch-up:sale-1", "cloud"]);
    expect(cloud.calls).toMatchObject([{ invoice: { voucher: INVOICE } }]);
    expect(outcome).toEqual({
      invoicing: { kind: "invoiced" },
      creditNote: { kind: "answered", answer: AUTHORIZED },
    });
  });

  it("keeps the credit note waiting, asking the cloud nothing, while the sale is still not invoiced", async () => {
    const { steps, onCatchUp, run } = register(AWAITING_NOTE, DEFERRED);
    onCatchUp(async () => ({ kind: "not_yet", cause: "cannot_authorize" }));

    const outcome = await run({ kind: "awaiting_invoice", creditNoteId: "credit-note-1" });

    expect(steps).toEqual(["catch-up:sale-1"]);
    expect(outcome).toEqual({
      invoicing: { kind: "not_yet", cause: "cannot_authorize" },
      creditNote: { kind: "answered", answer: { kind: "in_progress" } },
    });
  });

  it("asks the cloud for the credit note when the sale was already invoiced before it was asked to", async () => {
    const { steps, onCatchUp, run } = register(AWAITING_NOTE, INVOICED);
    onCatchUp(async () => ({ kind: "not_pending" }));

    const outcome = await run({ kind: "awaiting_invoice", creditNoteId: "credit-note-1" });

    expect(steps).toEqual(["catch-up:sale-1", "cloud"]);
    expect(outcome).toEqual({
      invoicing: { kind: "not_pending" },
      creditNote: { kind: "answered", answer: AUTHORIZED },
    });
  });

  it("asks the sale for no invoice when its credit note already corrects one", async () => {
    const { steps, run } = register(INVOICED_NOTE, INVOICED);

    const outcome = await run({ kind: "pending", creditNoteId: "credit-note-1" });

    expect(steps).toEqual(["cloud"]);
    expect(outcome).toEqual({
      invoicing: { kind: "not_awaited" },
      creditNote: { kind: "answered", answer: AUTHORIZED },
    });
  });

  it("still asks for the credit note when invoicing the sale breaks, and gives that failure", async () => {
    const { steps, onCatchUp, run } = register(AWAITING_NOTE, DEFERRED);
    const failure = new Error("catch-up broke");
    onCatchUp(async () => {
      throw failure;
    });

    const outcome = await run({ kind: "awaiting_invoice", creditNoteId: "credit-note-1" });

    expect(steps).toEqual(["catch-up:sale-1"]);
    expect(outcome).toEqual({
      invoicing: { kind: "failed", error: failure },
      creditNote: { kind: "answered", answer: { kind: "in_progress" } },
    });
  });

  it("asks the sale for no invoice and the cloud nothing for a credit note issued offline, printing it", async () => {
    const { steps, creditNotes, printer, run } = register(INVOICED_NOTE, INVOICED);
    creditNotes.answered.set("credit-note-1", { answer: ISSUED_OFFLINE, answeredAt: NOW });

    const outcome = await run({ kind: "issued_offline", creditNoteId: "credit-note-1" });

    expect(steps).toEqual([]);
    expect(outcome).toEqual({
      invoicing: { kind: "not_awaited" },
      creditNote: { kind: "answered", answer: ISSUED_OFFLINE },
    });
    expect(printer.started).toEqual([{ saleId: "sale-1", creditNoteId: "credit-note-1" }]);
  });

  it("gives the failure of asking for the credit note", async () => {
    const { cloud, run } = register(INVOICED_NOTE, INVOICED);
    const failure = new Error("the cloud client broke");
    cloud.failure = failure;

    expect(await run({ kind: "pending", creditNoteId: "credit-note-1" })).toEqual({
      invoicing: { kind: "not_awaited" },
      creditNote: { kind: "failed", answer: { kind: "in_progress" }, error: failure },
    });
  });
});
