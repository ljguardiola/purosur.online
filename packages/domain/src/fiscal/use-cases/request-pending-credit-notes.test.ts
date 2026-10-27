import { describe, expect, it } from "vitest";
import type { PushedEvent } from "../../sync/index.js";
import type { CreditNoteAnswer, SaleInvoice } from "../model/sale-credit-note.js";
import type { SaleInvoiceStanding } from "../model/sale-credit-note-route.js";
import type { PendingCreditNote } from "./request-credit-notes-ports.js";
import { requestPendingCreditNotes } from "./request-pending-credit-notes.js";
import { ManualClock } from "./test-support/fake-arca-vitality.js";
import {
  type CloudReply,
  FakeCloudCreditNotes,
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

function awaitingNote(index: number): PendingCreditNote {
  return {
    creditNoteId: `credit-note-${index}`,
    saleId: `sale-${index}`,
    total: 3_000,
    receiverTaxStatusCode: null,
    correctedVoucher: null,
    origin: { kind: "sale_return", returnId: `return-${index}`, issuedOn: "2026-10-07" },
    saleEvent: {
      ...voidEvent(`sale-${index}`, `credit-note-${index}`),
      event_type: "sale_returned",
    },
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
  pending: PendingCreditNote[],
  replies: CloudReply[] = [],
  pointOfSale: number | null = 12,
  standings: Record<string, SaleInvoiceStanding> = {},
  refreshed: Record<string, SaleInvoiceStanding> = {},
) {
  const creditNotes = new FakeRegisterCreditNotes(pending, pointOfSale, standings, refreshed);
  const cloud = new FakeCloudCreditNotes(replies);
  const run = () => requestPendingCreditNotes({ creditNotes, cloud, clock: new ManualClock(NOW) });
  return { creditNotes, cloud, run };
}

describe("requestPendingCreditNotes", () => {
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

  it("records that the invoice already had a credit note, as the final answer", async () => {
    const { creditNotes, run } = register([pendingNote(1)], [{ kind: "already_credited" }]);

    const outcome = await run();

    expect(creditNotes.answered.get("credit-note-1")).toEqual({
      answer: { kind: "already_credited" },
      answeredAt: NOW,
    });
    expect(outcome).toEqual({
      kind: "requested",
      answers: [{ creditNoteId: "credit-note-1", answer: { kind: "already_credited" } }],
    });
  });

  it("never asks again about a credit note whose invoice already had one", async () => {
    const { cloud, run } = register([pendingNote(1)], [{ kind: "already_credited" }, AUTHORIZED]);

    await run();
    await run();

    expect(cloud.calls).toHaveLength(1);
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

  describe("credit notes that wait for the invoice of their sale", () => {
    const INVOICED = { fiscalDocuments: [AUTHORIZED_INVOICE], deferralPending: false };
    const ON_ITS_WAY = { fiscalDocuments: [], deferralPending: true };
    const NEVER = { fiscalDocuments: [], deferralPending: false };

    it("ties each one whose sale got an invoice to it and asks the cloud for it with that invoice", async () => {
      const { creditNotes, cloud, run } = register(
        [awaitingNote(1), pendingNote(2), awaitingNote(3)],
        [AUTHORIZED, AUTHORIZED, AUTHORIZED],
        12,
        { "sale-1": INVOICED, "sale-3": ON_ITS_WAY },
      );

      await run();

      expect([...creditNotes.tied.keys()]).toEqual(["credit-note-1"]);
      expect(
        cloud.calls.map(({ creditNoteId, invoice }) => [creditNoteId, invoice !== undefined]),
      ).toEqual([
        ["credit-note-1", true],
        ["credit-note-2", false],
      ]);
    });

    it("leaves those whose invoice is on its way in progress, asking nothing for them", async () => {
      const { creditNotes, cloud, run } = register([awaitingNote(1)], [AUTHORIZED], 12, {
        "sale-1": ON_ITS_WAY,
      });

      expect(await run()).toEqual({
        kind: "requested",
        answers: [{ creditNoteId: "credit-note-1", answer: { kind: "in_progress" } }],
      });
      expect(creditNotes.answered.size).toBe(0);
      expect(cloud.calls).toEqual([]);
    });

    describe("whose invoice was on its way when the register last learned of it", () => {
      it("learns the invoice from the branch sale again and ties the credit note to it", async () => {
        const { creditNotes, cloud, run } = register(
          [awaitingNote(1)],
          [AUTHORIZED],
          12,
          { "sale-1": ON_ITS_WAY },
          { "sale-1": INVOICED },
        );

        await run();

        expect(creditNotes.refreshLookups).toEqual(["sale-1"]);
        expect([...creditNotes.tied.keys()]).toEqual(["credit-note-1"]);
        expect(cloud.calls.map(({ invoice }) => invoice !== undefined)).toEqual([true]);
      });

      it.each([
        ["the branch sale could not be asked", {}],
        ["the invoice is still on its way", { "sale-1": ON_ITS_WAY }],
      ])("stays in progress, asking the cloud for nothing, when %s", async (_name, refreshed) => {
        const { creditNotes, cloud, run } = register(
          [awaitingNote(1)],
          [AUTHORIZED],
          12,
          { "sale-1": ON_ITS_WAY },
          refreshed,
        );

        expect(await run()).toEqual({
          kind: "requested",
          answers: [{ creditNoteId: "credit-note-1", answer: { kind: "in_progress" } }],
        });

        expect(creditNotes.refreshLookups).toEqual(["sale-1"]);
        expect(creditNotes.answered.size).toBe(0);
        expect(creditNotes.tied.size).toBe(0);
        expect(cloud.calls).toEqual([]);
      });

      it("records that a person must regularize it when the branch sale says no invoice is on its way any more", async () => {
        const { creditNotes, run } = register(
          [awaitingNote(1)],
          [],
          12,
          { "sale-1": ON_ITS_WAY },
          { "sale-1": NEVER },
        );

        await run();

        expect(creditNotes.answered.get("credit-note-1")?.answer).toEqual({
          kind: "regularization_required",
        });
      });

      it.each([
        ["an invoice", INVOICED],
        ["no invoice on its way", NEVER],
      ])("is not asked again for a sale with %s", async (_name, standing) => {
        const { creditNotes, run } = register([awaitingNote(1)], [AUTHORIZED], 12, {
          "sale-1": standing,
        });

        await run();

        expect(creditNotes.refreshLookups).toEqual([]);
      });
    });

    it("records that a person must regularize those no invoice is on its way to, and goes on", async () => {
      const { creditNotes, cloud, run } = register(
        [awaitingNote(1), pendingNote(2)],
        [AUTHORIZED],
        12,
        { "sale-1": NEVER },
      );

      const outcome = await run();

      expect(creditNotes.answered.get("credit-note-1")).toEqual({
        answer: { kind: "regularization_required" },
        answeredAt: NOW,
      });
      expect(cloud.calls.map(({ creditNoteId }) => creditNoteId)).toEqual(["credit-note-2"]);
      expect(outcome.answers).toEqual([
        { creditNoteId: "credit-note-1", answer: { kind: "regularization_required" } },
        { creditNoteId: "credit-note-2", answer: AUTHORIZED },
      ]);
    });

    it("records the regularization the cloud asks for", async () => {
      const { creditNotes, run } = register(
        [awaitingNote(1)],
        [{ kind: "regularization_required" }],
        12,
        { "sale-1": INVOICED },
      );

      await run();

      expect(creditNotes.answered.get("credit-note-1")?.answer).toEqual({
        kind: "regularization_required",
      });
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
