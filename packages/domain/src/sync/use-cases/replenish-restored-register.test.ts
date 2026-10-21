import { describe, expect, it } from "vitest";
import type { RestoredCreditNoteAnswer, SaleVoidCreditNote } from "../../fiscal/index.js";
import type { SyncedFact } from "../model/synced-fact.js";
import { A_CLOCK_CORRECTED_FACT, aVoidedSaleFact } from "../model/test-support/synced-facts.js";
import { replenishRestoredRegister } from "./replenish-restored-register.js";
import {
  aPage,
  aUser,
  FakeRegisterReplenishmentDecoder,
  FakeRegisterReplenishmentFeed,
  FakeRegisterReplenishmentStore,
} from "./test-support/fake-register-replenishment.js";
import {
  anEvent,
  aSaleVoidedEvent,
} from "./test-support/fake-restored-register-replenishment.js";

const PREDECESSOR = { deviceId: "device-old", lastAcknowledgedSeq: 52 };

function aRestoredRegister() {
  const feed = new FakeRegisterReplenishmentFeed();
  const store = new FakeRegisterReplenishmentStore(PREDECESSOR);
  const decoder = new FakeRegisterReplenishmentDecoder();
  const run = () => replenishRestoredRegister({ feed, store, decoder });
  return { feed, store, decoder, run };
}

function aCreditNote(saleId: string, creditNoteId = `credit-note-${saleId}`): SaleVoidCreditNote {
  return {
    creditNoteId,
    saleId,
    total: 4800,
    receiverTaxStatusCode: 5,
    correctedVoucher: { voucherType: 11, pointOfSale: 7, number: 42 },
  };
}

function anAuthorizedAnswer(creditNote: SaleVoidCreditNote): RestoredCreditNoteAnswer {
  return {
    saleId: creditNote.saleId,
    creditNoteId: creditNote.creditNoteId,
    answeredAt: new Date("2026-10-07T10:30:00.000Z"),
    answer: {
      kind: "authorized",
      pointOfSale: 7,
      number: 9,
      issuedOn: "2026-10-07",
      issuedAt: new Date("2026-10-07T10:29:00.000Z"),
      authorizationCode: "74123456789012",
      authorizationCodeDueOn: "2026-10-17",
    },
  };
}

function aVoidedSaleOf(creditNote: SaleVoidCreditNote | null, saleId: string): SyncedFact {
  return { ...aVoidedSaleFact({ id: saleId }), creditNote };
}

describe("replenishRestoredRegister", () => {
  it("has nothing to replenish, and asks the cloud for nothing, when the register has no predecessor", async () => {
    const feed = new FakeRegisterReplenishmentFeed();
    const store = new FakeRegisterReplenishmentStore(undefined);

    const outcome = await replenishRestoredRegister({
      feed,
      store,
      decoder: new FakeRegisterReplenishmentDecoder(),
    });

    expect(outcome).toEqual({ kind: "nothing_to_replenish" });
    expect(feed.requests).toEqual([]);
    expect(store.transactions).toBe(0);
  });

  it("asks the cloud for the events after the predecessor's last acknowledged one", async () => {
    const { feed, run } = aRestoredRegister();
    feed.answers = [aPage([])];

    await run();

    expect(feed.requests).toEqual([{ predecessor: PREDECESSOR, after: undefined }]);
  });

  it("applies every event of the page in the order the cloud sent them and forgets the predecessor", async () => {
    const { feed, store, decoder, run } = aRestoredRegister();
    const events = [anEvent("device-old", 53), anEvent("device-old", 54), anEvent("device-new", 1)];
    decoder.facts.set(events[1]?.event.event_id ?? "", A_CLOCK_CORRECTED_FACT);
    feed.answers = [aPage(events)];

    const outcome = await run();

    expect(outcome).toEqual({ kind: "replenished" });
    expect(store.state.facts.map(({ source }) => source)).toEqual(
      events.map(({ deviceId, event }) => ({ eventId: event.event_id, deviceId })),
    );
    expect(store.state.facts[1]?.fact).toEqual(A_CLOCK_CORRECTED_FACT);
    expect(store.state.appliedEventIds).toEqual(events.map(({ event }) => event.event_id));
    expect(store.state.predecessor).toBeUndefined();
  });

  it("applies the page's users in their own local transaction before its events", async () => {
    const { feed, store, run } = aRestoredRegister();
    const users = [aUser("user-1"), aUser("user-2")];
    const order: string[] = [];
    const applyUsers = store.applyUsers.bind(store);
    store.applyUsers = async (applied) => {
      order.push(`users after ${store.transactions} event transactions`);
      await applyUsers(applied);
    };
    feed.answers = [aPage([anEvent("device-old", 53)], null, users)];

    await run();

    expect(order).toEqual(["users after 0 event transactions"]);
    expect(store.transactions).toBe(1);
    expect(store.state.users).toEqual([users]);
  });

  it("applies one page per local transaction, asking for the next page after where the last one ended", async () => {
    const { feed, store, run } = aRestoredRegister();
    const first = [anEvent("device-old", 53), anEvent("device-old", 54)];
    const second = [anEvent("device-new", 1)];
    feed.answers = [aPage(first, { deviceId: "device-old", deviceSeq: 54 }), aPage(second)];

    const outcome = await run();

    expect(outcome).toEqual({ kind: "replenished" });
    expect(feed.requests.map(({ after }) => after)).toEqual([
      undefined,
      { deviceId: "device-old", deviceSeq: 54 },
    ]);
    expect(store.transactions).toBe(2);
    expect(store.state.appliedEventIds).toHaveLength(3);
  });

  it("keeps the predecessor until the last page is applied", async () => {
    const { feed, store, run } = aRestoredRegister();
    feed.answers = [
      aPage([anEvent("device-old", 53)], { deviceId: "device-old", deviceSeq: 53 }),
      { kind: "unreachable" },
    ];

    const outcome = await run();

    expect(outcome).toEqual({ kind: "unreachable" });
    expect(store.state.predecessor).toEqual(PREDECESSOR);
    expect(store.state.appliedEventIds).toEqual(["event-device-old-53"]);
  });

  it("applies nothing twice when it runs again after stopping halfway", async () => {
    const { feed, store, run } = aRestoredRegister();
    const first = [anEvent("device-old", 53)];
    const second = [anEvent("device-old", 54)];
    feed.answers = [
      aPage(first, { deviceId: "device-old", deviceSeq: 53 }),
      { kind: "unreachable" },
      aPage(first, { deviceId: "device-old", deviceSeq: 53 }),
      aPage(second),
    ];

    await run();
    const outcome = await run();

    expect(outcome).toEqual({ kind: "replenished" });
    expect(store.state.facts.map(({ source }) => source.eventId)).toEqual([
      "event-device-old-53",
      "event-device-old-54",
    ]);
    expect(store.state.appliedEventIds).toEqual(["event-device-old-53", "event-device-old-54"]);
  });

  it("has nothing left to replenish once it finished", async () => {
    const { feed, run } = aRestoredRegister();
    feed.answers = [aPage([anEvent("device-old", 53)])];
    await run();

    const outcome = await run();

    expect(outcome).toEqual({ kind: "nothing_to_replenish" });
    expect(feed.requests).toHaveLength(1);
  });

  it.each([
    "predecessor_not_of_register",
    "predecessor_not_revoked",
    "cursor_not_of_replenishment",
  ] as const)("reports the cloud's refusal %s and keeps the predecessor", async (refusal) => {
    const { feed, store, run } = aRestoredRegister();
    feed.answers = [{ kind: "refused", refusal }];

    const outcome = await run();

    expect(outcome).toEqual({ kind: "refused", refusal });
    expect(store.state.predecessor).toEqual(PREDECESSOR);
    expect(store.transactions).toBe(0);
  });

  it("reports a failed answer from the cloud and keeps the predecessor", async () => {
    const { feed, store, run } = aRestoredRegister();
    feed.answers = [{ kind: "failed", failure: { kind: "unreadable" } }];

    const outcome = await run();

    expect(outcome).toEqual({ kind: "failed", failure: { kind: "unreadable" } });
    expect(store.state.predecessor).toEqual(PREDECESSOR);
  });

  it("applies nothing of a page holding an event that cannot be decoded, and keeps the predecessor", async () => {
    const { feed, store, decoder, run } = aRestoredRegister();
    const events = [anEvent("device-old", 53), anEvent("device-old", 54)];
    decoder.unreadable.set("event-device-old-54", "no schema reads sale_completed version 99");
    feed.answers = [aPage(events, null, [aUser("user-1")])];

    const outcome = await run();

    expect(outcome).toEqual({
      kind: "unreadable_event",
      eventId: "event-device-old-54",
      reason: "no schema reads sale_completed version 99",
    });
    expect(store.transactions).toBe(0);
    expect(store.state).toMatchObject({ facts: [], appliedEventIds: [] });
    expect(store.state.predecessor).toEqual(PREDECESSOR);
  });

  it("keeps the users of a page holding an event that cannot be decoded", async () => {
    const { feed, store, decoder, run } = aRestoredRegister();
    decoder.unreadable.set("event-device-old-53", "garbled");
    feed.answers = [aPage([anEvent("device-old", 53)], null, [aUser("user-1")])];

    await run();

    expect(store.state.users).toEqual([[aUser("user-1")]]);
  });

  it("keeps the pages applied before the one that cannot be decoded", async () => {
    const { feed, store, decoder, run } = aRestoredRegister();
    decoder.unreadable.set("event-device-old-54", "garbled");
    feed.answers = [
      aPage([anEvent("device-old", 53)], { deviceId: "device-old", deviceSeq: 53 }),
      aPage([anEvent("device-old", 54)]),
    ];

    const outcome = await run();

    expect(outcome).toMatchObject({ kind: "unreadable_event" });
    expect(store.state.appliedEventIds).toEqual(["event-device-old-53"]);
  });

  it("leaves an event the register cannot apply yet unrecorded, applies the rest and keeps the predecessor", async () => {
    const { feed, store, run } = aRestoredRegister();
    const events = [
      anEvent("device-old", 53),
      anEvent("device-old", 54),
      anEvent("device-old", 55),
    ];
    store.notYetApplicable.add("event-device-old-54");
    feed.answers = [aPage(events)];

    const outcome = await run();

    expect(outcome).toEqual({ kind: "partially_replenished", unapplied: 1 });
    expect(store.state.appliedEventIds).toEqual(["event-device-old-53", "event-device-old-55"]);
    expect(store.state.predecessor).toEqual(PREDECESSOR);
  });

  it("counts the events it cannot apply yet over every page", async () => {
    const { feed, store, run } = aRestoredRegister();
    store.notYetApplicable.add("event-device-old-53");
    store.notYetApplicable.add("event-device-old-54");
    feed.answers = [
      aPage([anEvent("device-old", 53)], { deviceId: "device-old", deviceSeq: 53 }),
      aPage([anEvent("device-old", 54), anEvent("device-old", 55)]),
    ];

    const outcome = await run();

    expect(outcome).toEqual({ kind: "partially_replenished", unapplied: 2 });
    expect(store.state.appliedEventIds).toEqual(["event-device-old-55"]);
  });

  it("applies the event it could not apply before once the register can", async () => {
    const { feed, store, run } = aRestoredRegister();
    const events = [anEvent("device-old", 53), anEvent("device-old", 54)];
    store.notYetApplicable.add("event-device-old-54");
    feed.answers = [aPage(events), aPage(events)];
    await run();
    store.notYetApplicable.clear();

    const outcome = await run();

    expect(outcome).toEqual({ kind: "replenished" });
    expect(store.state.facts.map(({ source }) => source.eventId)).toEqual([
      "event-device-old-53",
      "event-device-old-54",
    ]);
  });

  it("leaves none of a page's events behind, but its users, when applying one of its events fails", async () => {
    const { feed, store, run } = aRestoredRegister();
    store.failAt = { operation: "applyFact", eventId: "event-device-old-54" };
    feed.answers = [
      aPage([anEvent("device-old", 53), anEvent("device-old", 54)], null, [aUser("user-1")]),
    ];

    await expect(run()).rejects.toThrow("storage unavailable");

    expect(store.state).toEqual({
      predecessor: PREDECESSOR,
      users: [[aUser("user-1")]],
      facts: [],
      appliedEventIds: [],
      creditNoteAnswers: [],
    });
  });

  it("applies none of a page's events when writing its users fails", async () => {
    const { feed, store, run } = aRestoredRegister();
    store.failAt = { operation: "applyUsers" };
    feed.answers = [aPage([anEvent("device-old", 53)], null, [aUser("user-1")])];

    await expect(run()).rejects.toThrow("storage unavailable");

    expect(store.transactions).toBe(0);
    expect(store.state).toMatchObject({ users: [], facts: [], appliedEventIds: [] });
  });

  it("leaves nothing of a page behind when recording an applied event fails", async () => {
    const { feed, store, run } = aRestoredRegister();
    store.failAt = { operation: "recordEventApplied", eventId: "event-device-old-54" };
    feed.answers = [aPage([anEvent("device-old", 53), anEvent("device-old", 54)])];

    await expect(run()).rejects.toThrow("storage unavailable");

    expect(store.state).toMatchObject({ facts: [], appliedEventIds: [] });
  });

  it("applies the page's events on the next run after a failed one", async () => {
    const { feed, store, run } = aRestoredRegister();
    store.failAt = { operation: "applyFact", eventId: "event-device-old-53" };
    feed.answers = [aPage([anEvent("device-old", 53)]), aPage([anEvent("device-old", 53)])];
    await expect(run()).rejects.toThrow("storage unavailable");
    store.failAt = undefined;

    const outcome = await run();

    expect(outcome).toEqual({ kind: "replenished" });
    expect(store.state.appliedEventIds).toEqual(["event-device-old-53"]);
  });

  it("keeps the predecessor when forgetting it fails, so the next run starts over without applying twice", async () => {
    const { feed, store, run } = aRestoredRegister();
    store.failAt = { operation: "finish" };
    feed.answers = [aPage([anEvent("device-old", 53)]), aPage([anEvent("device-old", 53)])];
    await expect(run()).rejects.toThrow("storage unavailable");
    store.failAt = undefined;

    const outcome = await run();

    expect(outcome).toEqual({ kind: "replenished" });
    expect(store.state.facts).toHaveLength(1);
  });

  describe("the credit note of a voided sale", () => {
    it("records the cloud's answer for the credit note the sale asked for, then the event", async () => {
      const { feed, store, decoder, run } = aRestoredRegister();
      const creditNote = aCreditNote("sale-1");
      const answer = anAuthorizedAnswer(creditNote);
      const event = aSaleVoidedEvent("device-old", 53, "sale-1");
      decoder.facts.set(event.event.event_id, aVoidedSaleOf(creditNote, "sale-1"));
      feed.answers = [aPage([event], null, [], [answer])];

      const outcome = await run();

      expect(outcome).toEqual({ kind: "replenished" });
      expect(store.state.creditNoteAnswers).toEqual([{ creditNote, answer }]);
      expect(store.state.appliedEventIds).toEqual([event.event.event_id]);
    });

    it("records no answer for a voided sale that asked for no credit note", async () => {
      const { feed, store, decoder, run } = aRestoredRegister();
      const event = aSaleVoidedEvent("device-old", 53, "sale-1");
      decoder.facts.set(event.event.event_id, aVoidedSaleOf(null, "sale-1"));
      feed.answers = [aPage([event], null, [], [anAuthorizedAnswer(aCreditNote("sale-1"))])];

      const outcome = await run();

      expect(outcome).toEqual({ kind: "replenished" });
      expect(store.state.creditNoteAnswers).toEqual([]);
    });

    it("reports a voided sale the cloud holds no answer for as partially replenished, recording neither an answer nor its event", async () => {
      const { feed, store, decoder, run } = aRestoredRegister();
      const event = aSaleVoidedEvent("device-old", 53, "sale-1");
      decoder.facts.set(event.event.event_id, aVoidedSaleOf(aCreditNote("sale-1"), "sale-1"));
      feed.answers = [aPage([event])];

      const outcome = await run();

      expect(outcome).toEqual({ kind: "partially_replenished", unapplied: 1 });
      expect(store.state.creditNoteAnswers).toEqual([]);
      expect(store.state.appliedEventIds).toEqual([]);
      expect(store.state.predecessor).toEqual(PREDECESSOR);
    });

    it("matches an answer by its credit note, not by the sale", async () => {
      const { feed, store, decoder, run } = aRestoredRegister();
      const event = aSaleVoidedEvent("device-old", 53, "sale-1");
      decoder.facts.set(
        event.event.event_id,
        aVoidedSaleOf(aCreditNote("sale-1", "credit-note-asked"), "sale-1"),
      );
      const other = anAuthorizedAnswer(aCreditNote("sale-1", "credit-note-other"));
      feed.answers = [aPage([event], null, [], [other])];

      const outcome = await run();

      expect(outcome).toEqual({ kind: "partially_replenished", unapplied: 1 });
      expect(store.state.creditNoteAnswers).toEqual([]);
    });

    it("applies the rest of the page when one voided sale has no answer", async () => {
      const { feed, store, decoder, run } = aRestoredRegister();
      const answered = aCreditNote("sale-1");
      const unanswered = aCreditNote("sale-2");
      const events = [
        aSaleVoidedEvent("device-old", 53, "sale-1"),
        aSaleVoidedEvent("device-old", 54, "sale-2"),
        anEvent("device-old", 55),
      ];
      decoder.facts.set(events[0]?.event.event_id ?? "", aVoidedSaleOf(answered, "sale-1"));
      decoder.facts.set(events[1]?.event.event_id ?? "", aVoidedSaleOf(unanswered, "sale-2"));
      feed.answers = [aPage(events, null, [], [anAuthorizedAnswer(answered)])];

      const outcome = await run();

      expect(outcome).toEqual({ kind: "partially_replenished", unapplied: 1 });
      expect(store.state.creditNoteAnswers.map(({ creditNote }) => creditNote)).toEqual([answered]);
      expect(store.state.appliedEventIds).toEqual([
        events[0]?.event.event_id,
        events[2]?.event.event_id,
      ]);
    });

    it("takes each page's answers from that page, so every answer is used once across the pages", async () => {
      const { feed, store, decoder, run } = aRestoredRegister();
      const first = aCreditNote("sale-1");
      const second = aCreditNote("sale-2");
      const firstEvent = aSaleVoidedEvent("device-old", 53, "sale-1");
      const secondEvent = aSaleVoidedEvent("device-old", 54, "sale-2");
      decoder.facts.set(firstEvent.event.event_id, aVoidedSaleOf(first, "sale-1"));
      decoder.facts.set(secondEvent.event.event_id, aVoidedSaleOf(second, "sale-2"));
      feed.answers = [
        aPage([firstEvent], { deviceId: "device-old", deviceSeq: 53 }, [], [
          anAuthorizedAnswer(first),
        ]),
        aPage([secondEvent], null, [], [anAuthorizedAnswer(second)]),
      ];

      const outcome = await run();

      expect(outcome).toEqual({ kind: "replenished" });
      expect(store.state.creditNoteAnswers.map(({ creditNote }) => creditNote)).toEqual([
        first,
        second,
      ]);
    });

    it("does not use an answer of one page for a sale of another", async () => {
      const { feed, store, decoder, run } = aRestoredRegister();
      const creditNote = aCreditNote("sale-2");
      const firstEvent = anEvent("device-old", 53);
      const secondEvent = aSaleVoidedEvent("device-old", 54, "sale-2");
      decoder.facts.set(secondEvent.event.event_id, aVoidedSaleOf(creditNote, "sale-2"));
      feed.answers = [
        aPage([firstEvent], { deviceId: "device-old", deviceSeq: 53 }, [], [
          anAuthorizedAnswer(creditNote),
        ]),
        aPage([secondEvent]),
      ];

      const outcome = await run();

      expect(outcome).toEqual({ kind: "partially_replenished", unapplied: 1 });
      expect(store.state.creditNoteAnswers).toEqual([]);
    });

    it("records the answer once the cloud holds it, when the call is repeated", async () => {
      const { feed, store, decoder, run } = aRestoredRegister();
      const creditNote = aCreditNote("sale-1");
      const event = aSaleVoidedEvent("device-old", 53, "sale-1");
      decoder.facts.set(event.event.event_id, aVoidedSaleOf(creditNote, "sale-1"));
      feed.answers = [
        aPage([event]),
        aPage([event], null, [], [anAuthorizedAnswer(creditNote)]),
      ];
      await run();

      const outcome = await run();

      expect(outcome).toEqual({ kind: "replenished" });
      expect(store.state.creditNoteAnswers).toHaveLength(1);
    });

    it("leaves nothing of a page behind when recording a credit note answer fails", async () => {
      const { feed, store, decoder, run } = aRestoredRegister();
      const creditNote = aCreditNote("sale-1");
      const event = aSaleVoidedEvent("device-old", 53, "sale-1");
      decoder.facts.set(event.event.event_id, aVoidedSaleOf(creditNote, "sale-1"));
      store.failAt = { operation: "recordCreditNoteAnswer" };
      feed.answers = [aPage([event], null, [], [anAuthorizedAnswer(creditNote)])];

      await expect(run()).rejects.toThrow("storage unavailable");

      expect(store.state).toMatchObject({ facts: [], creditNoteAnswers: [], appliedEventIds: [] });
    });
  });
});
