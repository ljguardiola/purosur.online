import { describe, expect, it } from "vitest";
import type { PushedEvent } from "../../sync/index.js";
import type { CreditNoteAnswer, VoidCreditNoteStanding } from "../model/sale-void-credit-note.js";
import type { PendingCreditNote } from "./request-void-credit-notes-ports.js";
import { requestVoidedSaleCreditNote } from "./request-voided-sale-credit-note.js";
import { ManualClock } from "./test-support/fake-arca-vitality.js";
import {
  type CloudReply,
  FakeCloudCreditNotes,
  FakeCreditNotePrinter,
  FakeRegisterVoidCreditNotes,
} from "./test-support/fake-void-credit-notes.js";

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

function register(
  replies: CloudReply[] = [AUTHORIZED],
  { pointOfSale = 12 as number | null, pending = [pendingNote(1), pendingNote(2)] } = {},
) {
  const creditNotes = new FakeRegisterVoidCreditNotes(pending, pointOfSale);
  const cloud = new FakeCloudCreditNotes(replies);
  const printer = new FakeCreditNotePrinter();
  const run = () =>
    requestVoidedSaleCreditNote(
      { creditNotes, cloud, clock: new ManualClock(NOW), printer },
      { creditNoteId: "credit-note-1", saleId: "sale-1" },
    );
  return { creditNotes, cloud, printer, run };
}

describe("requestVoidedSaleCreditNote", () => {
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

  it.each<[string, VoidCreditNoteStanding]>([
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
