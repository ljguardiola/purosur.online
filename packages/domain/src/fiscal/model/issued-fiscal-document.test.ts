import { describe, expect, it } from "vitest";
import {
  CAEA_DOCUMENT_ISSUED_STATE,
  ISSUED_FISCAL_DOCUMENTS_PAGE_SIZE,
  LISTED_ONLINE_DOCUMENT_STATES,
} from "./issued-fiscal-document.js";

describe("LISTED_ONLINE_DOCUMENT_STATES", () => {
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
  ] as const)("lists a requested document %s as %s", (_name, answer, decision, state) => {
    expect(LISTED_ONLINE_DOCUMENT_STATES).toContainEqual({
      requested: true,
      answer,
      decision,
      state,
    });
  });

  it.each([
    ["rejected", true, "rejected", null],
    ["unclear and released", true, "unclear", "released"],
    ["unclear and conflicting", true, "unclear", "conflicting"],
    ["never attempted and released", true, "not_attempted", "released"],
    ["never attempted and conflicting", true, "not_attempted", "conflicting"],
    ["not requested yet", false, null, null],
  ] as const)("does not list a document %s", (_name, requested, answer, decision) => {
    expect(LISTED_ONLINE_DOCUMENT_STATES).not.toContainEqual(
      expect.objectContaining({ requested, answer, decision }),
    );
  });

  it("names every combination it lists, once", () => {
    expect(LISTED_ONLINE_DOCUMENT_STATES).toEqual([
      { requested: true, answer: "authorized", decision: null, state: "authorized" },
      { requested: true, answer: "unclear", decision: "adopted", state: "authorized" },
      { requested: true, answer: "not_attempted", decision: "adopted", state: "authorized" },
      { requested: true, answer: null, decision: null, state: "awaiting_authorization" },
      { requested: true, answer: "unclear", decision: null, state: "awaiting_authorization" },
      {
        requested: true,
        answer: "not_attempted",
        decision: null,
        state: "awaiting_authorization",
      },
    ]);
  });
});

it("lists a document issued under a CAEA as authorized", () => {
  expect(CAEA_DOCUMENT_ISSUED_STATE).toBe("authorized");
});

it("pages fifty documents at a time", () => {
  expect(ISSUED_FISCAL_DOCUMENTS_PAGE_SIZE).toBe(50);
});
