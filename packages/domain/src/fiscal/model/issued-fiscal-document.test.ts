import { describe, expect, it } from "vitest";
import {
  ISSUED_FISCAL_DOCUMENTS_PAGE_SIZE,
  issuedStateOfOnlineDocument,
  LISTED_ONLINE_DOCUMENT_STATES,
} from "./issued-fiscal-document.js";

describe("issuedStateOfOnlineDocument", () => {
  it.each([
    ["authorized by the tax authority", "authorized", null, "authorized"],
    [
      "unclear and then adopted from the tax authority's voucher",
      "unclear",
      "adopted",
      "authorized",
    ],
    [
      "never attempted and then adopted from the tax authority's voucher",
      "not_attempted",
      "adopted",
      "authorized",
    ],
    ["requested and not answered yet", null, null, "awaiting_authorization"],
    ["unclear and not decided yet", "unclear", null, "awaiting_authorization"],
    ["never attempted and not decided yet", "not_attempted", null, "awaiting_authorization"],
  ] as const)("lists a document %s as %s", (_name, answer, decision, state) => {
    expect(issuedStateOfOnlineDocument({ answer, decision })).toBe(state);
  });

  it.each([
    ["rejected", "rejected", null],
    ["unclear and released", "unclear", "released"],
    ["unclear and conflicting", "unclear", "conflicting"],
    ["never attempted and released", "not_attempted", "released"],
    ["never attempted and conflicting", "not_attempted", "conflicting"],
  ] as const)("does not list a document %s", (_name, answer, decision) => {
    expect(issuedStateOfOnlineDocument({ answer, decision })).toBeNull();
  });

  it("names every combination it lists, once", () => {
    expect(LISTED_ONLINE_DOCUMENT_STATES).toEqual([
      { answer: "authorized", decision: null, state: "authorized" },
      { answer: "unclear", decision: "adopted", state: "authorized" },
      { answer: "not_attempted", decision: "adopted", state: "authorized" },
      { answer: null, decision: null, state: "awaiting_authorization" },
      { answer: "unclear", decision: null, state: "awaiting_authorization" },
      { answer: "not_attempted", decision: null, state: "awaiting_authorization" },
    ]);
  });

  it("pages fifty documents at a time", () => {
    expect(ISSUED_FISCAL_DOCUMENTS_PAGE_SIZE).toBe(50);
  });
});
