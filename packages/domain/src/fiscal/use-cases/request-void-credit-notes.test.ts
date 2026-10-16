import { describe, expect, it } from "vitest";
import type { PushedEvent } from "../../sync/index.js";
import type { CreditNoteAnswer } from "../model/sale-void-credit-note.js";
import { requestVoidCreditNotes } from "./request-void-credit-notes.js";
import type { PendingCreditNote } from "./request-void-credit-notes-ports.js";
import { ManualClock } from "./test-support/fake-arca-vitality.js";
import {
  type CloudReply,
  FakeCloudCreditNotes,
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
  authorizationCode: "75123456789099",
  authorizationCodeDueOn: "2026-10-17",
};

function register(
  pending: PendingCreditNote[],
  replies: CloudReply[] = [],
  pointOfSale: number | null = 12,
) {
  const creditNotes = new FakeRegisterVoidCreditNotes(pending, pointOfSale);
  const cloud = new FakeCloudCreditNotes(replies);
  const run = () => requestVoidCreditNotes({ creditNotes, cloud, clock: new ManualClock(NOW) });
  return { creditNotes, cloud, run };
}

describe("requestVoidCreditNotes", () => {
  it("asks the cloud for each pending credit note with its id, the real-time point of sale and the event of the void", async () => {
    const { cloud, run } = register([pendingNote(1), pendingNote(2)]);

    await run();

    expect(cloud.calls).toEqual([
      { creditNoteId: "credit-note-1", pointOfSale: 12, saleEvent: pendingNote(1).saleEvent },
      { creditNoteId: "credit-note-2", pointOfSale: 12, saleEvent: pendingNote(2).saleEvent },
    ]);
  });

  it("records the authorized credit note the cloud answers, when it answered", async () => {
    const { creditNotes, run } = register([pendingNote(1)], [AUTHORIZED]);

    const outcome = await run();

    expect(creditNotes.answered.get("credit-note-1")).toEqual({
      answer: AUTHORIZED,
      answeredAt: NOW,
    });
    expect(outcome).toEqual({
      kind: "requested",
      answers: [{ creditNoteId: "credit-note-1", answer: AUTHORIZED }],
    });
  });

  it("records the rejection the cloud answers", async () => {
    const { creditNotes, run } = register([pendingNote(1)], [{ kind: "rejected" }]);

    await run();

    expect(creditNotes.answered.get("credit-note-1")).toEqual({
      answer: { kind: "rejected" },
      answeredAt: NOW,
    });
  });

  it.each<[string, CloudReply]>([
    ["no answer", null],
    ["an answer that it is still in progress", { kind: "in_progress" }],
  ])("leaves the credit note in progress on %s", async (_case, reply) => {
    const { creditNotes, run } = register([pendingNote(1)], [reply]);

    const outcome = await run();

    expect(creditNotes.answered.size).toBe(0);
    expect(outcome).toEqual({
      kind: "requested",
      answers: [{ creditNoteId: "credit-note-1", answer: { kind: "in_progress" } }],
    });
  });

  it("goes on with the next credit note when one gets no answer", async () => {
    const { creditNotes, run } = register([pendingNote(1), pendingNote(2)], [null, AUTHORIZED]);

    await run();

    expect([...creditNotes.answered.keys()]).toEqual(["credit-note-2"]);
  });

  it("asks nothing when no credit note is pending", async () => {
    const { cloud, run } = register([]);

    expect(await run()).toEqual({ kind: "requested", answers: [] });
    expect(cloud.calls).toEqual([]);
  });

  it("asks nothing, leaving them in progress, while the register has no real-time point of sale", async () => {
    const { creditNotes, cloud, run } = register([pendingNote(1)], [AUTHORIZED], null);

    const outcome = await run();

    expect(cloud.calls).toEqual([]);
    expect(creditNotes.answered.size).toBe(0);
    expect(outcome).toEqual({
      kind: "requested",
      answers: [{ creditNoteId: "credit-note-1", answer: { kind: "in_progress" } }],
    });
  });

  describe("an interrupted void", () => {
    it("sends the credit note on resume, once, and records its answer", async () => {
      const { creditNotes, cloud, run } = register([pendingNote(1)], [AUTHORIZED]);

      await run();

      expect(cloud.calls).toHaveLength(1);
      expect(creditNotes.answered.get("credit-note-1")?.answer).toEqual(AUTHORIZED);
    });

    it("records the authorized answer of a credit note that was sent and got no answer, on a later run", async () => {
      const { creditNotes, cloud, run } = register([pendingNote(1)], [null]);
      await run();
      cloud.reply(AUTHORIZED);

      await run();

      expect(creditNotes.answered.get("credit-note-1")?.answer).toEqual(AUTHORIZED);
    });

    it("never creates a second credit note however many times it runs", async () => {
      const { creditNotes, cloud, run } = register([pendingNote(1)], [null, null, AUTHORIZED]);

      await run();
      await run();
      await run();
      await run();
      await run();

      expect(cloud.issued).toEqual(new Set(["credit-note-1"]));
      expect(cloud.calls).toHaveLength(3);
      expect(creditNotes.answered.size).toBe(1);
    });
  });
});
