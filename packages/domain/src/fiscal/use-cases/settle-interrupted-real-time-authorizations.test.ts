import { describe, expect, it } from "vitest";
import { deferredSaleRecordedEvent } from "../model/deferred-sale-recorded-event.js";
import { settleInterruptedRealTimeAuthorizations } from "./settle-interrupted-real-time-authorizations.js";
import { ManualClock } from "./test-support/fake-arca-vitality.js";
import { FakeInterruptedRealTimeAuthorizations } from "./test-support/fake-interrupted-real-time-authorizations.js";
import { SequentialIds } from "./test-support/fake-sale-authorization.js";
import { ScriptedShortCodes } from "./test-support/scripted-short-codes.js";

const STARTED_AT = new Date("2026-10-01T08:00:00.000Z");
const FIRST_RESERVED_AT = new Date("2026-10-01T07:58:00.000Z");
const SECOND_RESERVED_AT = new Date("2026-10-01T07:59:00.000Z");
const SHORT_CODES = ["7KQ4M2P9", "R3XW8H5N", "ABCDEFGH"];

const ORIGIN = { registerId: "register-1", actorId: "cashier" };

const FIRST = {
  fiscalDocumentId: "doc-1",
  saleId: "sale-1",
  origin: ORIGIN,
  reservedAt: FIRST_RESERVED_AT,
  total: 12_500,
};
const SECOND = {
  fiscalDocumentId: "doc-2",
  saleId: "sale-2",
  origin: { registerId: "register-1", actorId: "other-cashier" },
  reservedAt: SECOND_RESERVED_AT,
  total: 4_000,
};

function settle(
  requesting: (typeof FIRST)[],
  failOnDocument?: string,
  takenShortCodes: string[] = [],
) {
  const documents = new FakeInterruptedRealTimeAuthorizations(requesting, takenShortCodes);
  documents.failOnDocument = failOnDocument;
  const outcome = settleInterruptedRealTimeAuthorizations({
    documents,
    clock: new ManualClock(STARTED_AT),
    ids: new SequentialIds(),
    shortCodes: new ScriptedShortCodes(SHORT_CODES),
  });
  return { documents, outcome };
}

describe("settling the real-time authorizations a stopped register left requesting", () => {
  it("leaves each one unknown, deferred for an unclear outcome, at the moment it settles them", async () => {
    const { documents, outcome } = settle([FIRST, SECOND]);

    expect(await outcome).toEqual({ kind: "settled", saleIds: ["sale-1", "sale-2"] });
    const firstSale = {
      id: "id-1",
      saleId: "sale-1",
      occurredAt: FIRST_RESERVED_AT,
      total: 12_500,
      reason: "unclear_outcome",
      shortCode: "7KQ4M2P9",
      routedAt: STARTED_AT,
    } as const;
    const secondSale = {
      id: "id-3",
      saleId: "sale-2",
      occurredAt: SECOND_RESERVED_AT,
      total: 4_000,
      reason: "unclear_outcome",
      shortCode: "R3XW8H5N",
      routedAt: STARTED_AT,
    } as const;
    expect(documents.resolutions).toEqual([
      {
        fiscalDocumentId: "doc-1",
        saleId: "sale-1",
        resolution: { state: "UNKNOWN", deferralReason: "unclear_outcome" },
        resolvedAt: STARTED_AT,
        deferredSale: {
          sale: firstSale,
          event: deferredSaleRecordedEvent({
            eventId: "id-2",
            ...ORIGIN,
            deferredSale: firstSale,
          }),
        },
      },
      {
        fiscalDocumentId: "doc-2",
        saleId: "sale-2",
        resolution: { state: "UNKNOWN", deferralReason: "unclear_outcome" },
        resolvedAt: STARTED_AT,
        deferredSale: {
          sale: secondSale,
          event: deferredSaleRecordedEvent({
            eventId: "id-4",
            registerId: "register-1",
            actorId: "other-cashier",
            deferredSale: secondSale,
          }),
        },
      },
    ]);
  });

  it("draws another short code for a sale's record when the first is already taken", async () => {
    const { documents, outcome } = settle([FIRST], undefined, ["7KQ4M2P9"]);

    await outcome;

    expect(documents.resolutions.map(({ deferredSale }) => deferredSale?.sale.shortCode)).toEqual([
      "R3XW8H5N",
    ]);
    expect(documents.resolutionAttempts.map(({ deferredSale }) => deferredSale?.sale.id)).toEqual([
      "id-1",
      "id-1",
    ]);
  });

  it("settles none of them when settling one of them fails", async () => {
    const { documents, outcome } = settle([FIRST, SECOND], "doc-2");

    await expect(outcome).rejects.toThrow("resolving doc-2 failed");
    expect(documents.resolutions).toEqual([]);
  });

  it("settles nothing when no authorization was left requesting", async () => {
    const { documents, outcome } = settle([]);

    expect(await outcome).toEqual({ kind: "settled", saleIds: [] });
    expect(documents.resolutions).toEqual([]);
  });
});
