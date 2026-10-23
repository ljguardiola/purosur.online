import { describe, expect, it } from "vitest";
import { deferredSaleUnclearDocumentEventSchema } from "./deferred-sale-unclear-document.js";

const DOCUMENT_ID = "0199b7a0-0000-7000-8000-000000000004";

const recordedEvent = {
  event_id: "0199b7a0-0000-7000-8000-000000000001",
  event_type: "deferred_sale_recorded",
  schema_version: 2,
  aggregate_id: "0199b7a0-0000-7000-8000-000000000002",
  payload: {
    reason: "unclear_outcome",
    unclear_document: { fiscal_document_id: DOCUMENT_ID, number: 42 },
  },
};

describe("deferredSaleUnclearDocumentEventSchema", () => {
  it("reads the document an unclear outcome left waiting from the event that recorded the deferral", () => {
    expect(deferredSaleUnclearDocumentEventSchema.parse(recordedEvent)).toEqual({
      event_type: "deferred_sale_recorded",
      schema_version: 2,
      payload: { unclear_document: { fiscal_document_id: DOCUMENT_ID } },
    });
  });

  it("lowercases the id of the waiting document", () => {
    const parsed = deferredSaleUnclearDocumentEventSchema.parse({
      ...recordedEvent,
      payload: { unclear_document: { fiscal_document_id: DOCUMENT_ID.toUpperCase() } },
    });

    expect(parsed.payload.unclear_document.fiscal_document_id).toBe(DOCUMENT_ID);
  });

  it.each([
    ["an event of another type", { event_type: "deferred_sale_satisfied" }],
    ["a record of the first version, which holds no document", { schema_version: 1 }],
    ["a record that left no document waiting", { payload: { unclear_document: null } }],
    ["a record with no mention of a document", { payload: { reason: "rejected" } }],
    [
      "a document without its id",
      { payload: { unclear_document: { fiscal_document_id: undefined } } },
    ],
    [
      "a document whose id is not a record id",
      { payload: { unclear_document: { fiscal_document_id: "document-1" } } },
    ],
  ])("refuses %s", (_case, overrides) => {
    expect(
      deferredSaleUnclearDocumentEventSchema.safeParse({ ...recordedEvent, ...overrides }).success,
    ).toBe(false);
  });
});
