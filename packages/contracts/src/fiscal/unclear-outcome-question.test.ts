import { describe, expect, it } from "vitest";
import {
  unclearOutcomeAnswerSchema,
  unclearOutcomeQuestionSchema,
} from "./unclear-outcome-question.js";

const saleEvent = {
  event_id: "0199b7a0-0000-7000-8000-000000000001",
  device_seq: 17,
  aggregate_type: "Sale",
  aggregate_id: "0199b7a0-0000-7000-8000-000000000002",
  event_type: "sale_completed",
  schema_version: 2,
  payload: { total: 12_500 },
  occurred_at: "2026-10-01T11:59:58.000Z",
  actor_id: "user-1",
  chain_hmac: "ab12",
};

const question = {
  fiscal_document_id: "0199b7a0-0000-7000-8000-000000000003",
  sale_id: "0199b7a0-0000-7000-8000-000000000002",
  point_of_sale: 12,
  number: 41,
  issued_on: "2026-10-01",
  total: 12_500,
  buyer_tax_status_code: 5,
  sale_event: saleEvent,
};

function questionWith(overrides: Record<string, unknown>) {
  return unclearOutcomeQuestionSchema.safeParse({ ...question, ...overrides });
}

describe("unclearOutcomeQuestionSchema", () => {
  it("reads a question about a document's unclear outcome, with its content and its sale's event", () => {
    expect(unclearOutcomeQuestionSchema.parse(question)).toEqual(question);
  });

  it.each(Object.keys(question))("refuses a question without its %s", (field) => {
    expect(questionWith({ [field]: undefined }).success).toBe(false);
  });

  it.each([
    ["a fiscal document id that is not an id", { fiscal_document_id: "not-an-id" }],
    ["a point of sale the tax authority does not allow", { point_of_sale: 0 }],
    ["a number of zero", { number: 0 }],
    ["a day that does not exist", { issued_on: "2026-02-30" }],
    ["a negative total", { total: -1 }],
    ["an event without its chain proof", { sale_event: { ...saleEvent, chain_hmac: undefined } }],
  ])("refuses %s", (_case, overrides) => {
    expect(questionWith(overrides).success).toBe(false);
  });

  it("keeps nothing of the question but the document's content and its sale's event", () => {
    expect(
      questionWith({ register_id: "register-1", timeout_ms: 5_000, rtt_median_ms: 200 }).data,
    ).toEqual(question);
  });
});

describe("unclearOutcomeAnswerSchema", () => {
  it.each([
    ["a decision still pending", { state: "PENDING" }],
    ["a released number", { state: "RELEASED" }],
    [
      "an adopted voucher with its authorization code",
      {
        state: "ADOPTED",
        authorization_code: "75123456789012",
        authorization_code_due_on: "2026-10-11",
      },
    ],
    ["a conflicting voucher", { state: "CONFLICTING" }],
    [
      "the authorization the tax authority answered, with its code",
      {
        state: "AUTHORIZED",
        authorization_code: "75123456789012",
        authorization_code_due_on: "2026-10-11",
      },
    ],
    [
      "the rejection the tax authority answered, with its codes and class",
      { state: "REJECTED", rejection_codes: [10015], rejection_class: "content" },
    ],
  ])("reads %s", (_case, answer) => {
    expect(unclearOutcomeAnswerSchema.parse(answer)).toEqual(answer);
  });

  it.each([
    ["an adoption without its code", { state: "ADOPTED", authorization_code_due_on: "2026-10-11" }],
    [
      "an adoption with an empty code",
      { state: "ADOPTED", authorization_code: "", authorization_code_due_on: "2026-10-11" },
    ],
    ["an adoption without its due day", { state: "ADOPTED", authorization_code: "75123456789012" }],
    [
      "an adoption with a due day that does not exist",
      {
        state: "ADOPTED",
        authorization_code: "75123456789012",
        authorization_code_due_on: "2026-13-01",
      },
    ],
    [
      "an authorization without its code",
      { state: "AUTHORIZED", authorization_code_due_on: "2026-10-11" },
    ],
    ["a rejection without its codes", { state: "REJECTED", rejection_class: "content" }],
    [
      "a rejection of a class nobody knows",
      { state: "REJECTED", rejection_codes: [10015], rejection_class: "temporary" },
    ],
    ["a state nobody knows", { state: "UNCLEAR" }],
    ["no state", {}],
  ])("refuses %s", (_case, answer) => {
    expect(unclearOutcomeAnswerSchema.safeParse(answer).success).toBe(false);
  });

  it("keeps nothing of a pending decision but its state", () => {
    expect(unclearOutcomeAnswerSchema.parse({ state: "PENDING", detail: "x" })).toEqual({
      state: "PENDING",
    });
  });
});
