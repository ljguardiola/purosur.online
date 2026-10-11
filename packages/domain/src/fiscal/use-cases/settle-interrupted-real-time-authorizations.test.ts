import { describe, expect, it } from "vitest";
import { settleInterruptedRealTimeAuthorizations } from "./settle-interrupted-real-time-authorizations.js";
import { ManualClock } from "./test-support/fake-arca-vitality.js";
import { FakeInterruptedRealTimeAuthorizations } from "./test-support/fake-interrupted-real-time-authorizations.js";

const STARTED_AT = new Date("2026-10-01T08:00:00.000Z");

function settle(
  requesting: { fiscalDocumentId: string; saleId: string }[],
  failOnDocument?: string,
) {
  const documents = new FakeInterruptedRealTimeAuthorizations(requesting);
  documents.failOnDocument = failOnDocument;
  const outcome = settleInterruptedRealTimeAuthorizations({
    documents,
    clock: new ManualClock(STARTED_AT),
  });
  return { documents, outcome };
}

describe("settling the real-time authorizations a stopped register left requesting", () => {
  it("leaves each one unknown, deferred for an unclear outcome, at the moment it settles them", async () => {
    const { documents, outcome } = settle([
      { fiscalDocumentId: "doc-1", saleId: "sale-1" },
      { fiscalDocumentId: "doc-2", saleId: "sale-2" },
    ]);

    expect(await outcome).toEqual({ kind: "settled", saleIds: ["sale-1", "sale-2"] });
    expect(documents.resolutions).toEqual([
      {
        fiscalDocumentId: "doc-1",
        saleId: "sale-1",
        resolution: { state: "UNKNOWN", deferralReason: "unclear_outcome" },
        resolvedAt: STARTED_AT,
      },
      {
        fiscalDocumentId: "doc-2",
        saleId: "sale-2",
        resolution: { state: "UNKNOWN", deferralReason: "unclear_outcome" },
        resolvedAt: STARTED_AT,
      },
    ]);
  });

  it("settles none of them when settling one of them fails", async () => {
    const { documents, outcome } = settle(
      [
        { fiscalDocumentId: "doc-1", saleId: "sale-1" },
        { fiscalDocumentId: "doc-2", saleId: "sale-2" },
      ],
      "doc-2",
    );

    await expect(outcome).rejects.toThrow("resolving doc-2 failed");
    expect(documents.resolutions).toEqual([]);
  });

  it("settles nothing when no authorization was left requesting", async () => {
    const { documents, outcome } = settle([]);

    expect(await outcome).toEqual({ kind: "settled", saleIds: [] });
    expect(documents.resolutions).toEqual([]);
  });
});
