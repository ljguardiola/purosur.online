import { cloudError, unclearOutcomeQuestionSchema } from "@purosur/contracts";
import type { PushedEvent } from "@purosur/domain";
import type { UnclearOutcomeQuestion } from "@purosur/domain/fiscal/use-cases";
import { describe, expect, it } from "vitest";
import type { CloudCallOptions, CloudResponse } from "../platform/cloud-client";
import { CloudUnclearOutcomeDecisions } from "./cloud-unclear-outcome-decisions";
import { FACTURA_C, POINT_OF_SALE } from "./test-support/real-time-authorization-database";

const SALE_ID = "018f0000-0000-7000-8000-0000000000a1";

const SALE_EVENT: PushedEvent = {
  event_id: "018f0000-0000-7000-8000-000000000001",
  device_seq: 17,
  aggregate_type: "Sale",
  aggregate_id: SALE_ID,
  event_type: "sale_completed",
  schema_version: 2,
  payload: { id: SALE_ID, total: 12_500 },
  occurred_at: "2026-09-30T12:05:00.000Z",
  actor_id: "u1",
  chain_hmac: "hmac-1",
};

const QUESTION: UnclearOutcomeQuestion = {
  fiscalDocumentId: "018f0000-0000-7000-8000-0000000000d1",
  saleId: SALE_ID,
  pointOfSale: POINT_OF_SALE,
  number: 41,
  issuedOn: "2026-09-30",
  document: FACTURA_C,
  saleEvent: SALE_EVENT,
};

interface Post {
  path: string;
  bearerToken: string;
  body: unknown;
  options: CloudCallOptions;
}

function cloud(answer: CloudResponse, token: string | null = "prefix.secret") {
  const posts: Post[] = [];
  const decisions = new CloudUnclearOutcomeDecisions({
    readDeviceToken: async () => token ?? undefined,
    post: async (path, bearerToken, body, options) => {
      posts.push({ path, bearerToken, body, options });
      return answer;
    },
  });
  return { posts, decisions };
}

function ok(body: unknown): CloudResponse {
  return { kind: "ok", body };
}

describe("asking the cloud about a document left with an unclear outcome", () => {
  it("posts the document and the sale's event, without a time budget, with the device token, once", async () => {
    const { posts, decisions } = cloud(ok({ state: "PENDING" }));

    await decisions.outcomeOf(QUESTION);

    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({
      path: "/api/fiscal/unclear-outcomes",
      bearerToken: "prefix.secret",
      options: { singleAttempt: true },
    });
    expect(posts[0]?.body).toEqual({
      fiscal_document_id: QUESTION.fiscalDocumentId,
      sale_id: SALE_ID,
      point_of_sale: POINT_OF_SALE,
      number: 41,
      issued_on: "2026-09-30",
      total: 12_500,
      buyer_tax_status_code: 5,
      sale_event: SALE_EVENT,
    });
    expect(unclearOutcomeQuestionSchema.safeParse(posts[0]?.body).success).toBe(true);
  });

  it.each([
    [{ state: "PENDING" }, { kind: "pending" }],
    [{ state: "RELEASED" }, { kind: "decided", decision: { kind: "released" } }],
    [{ state: "CONFLICTING" }, { kind: "decided", decision: { kind: "conflicting" } }],
    [
      {
        state: "ADOPTED",
        authorization_code: "75123456789012",
        authorization_code_due_on: "2026-10-10",
      },
      {
        kind: "decided",
        decision: {
          kind: "adopted",
          authorizationCode: "75123456789012",
          authorizationCodeDueOn: "2026-10-10",
        },
      },
    ],
    [
      {
        state: "AUTHORIZED",
        authorization_code: "75123456789012",
        authorization_code_due_on: "2026-10-10",
      },
      {
        kind: "answered",
        answer: {
          kind: "authorized",
          authorizationCode: "75123456789012",
          authorizationCodeDueOn: "2026-10-10",
        },
      },
    ],
    [
      { state: "REJECTED", rejection_codes: [10015], rejection_class: "content" },
      {
        kind: "answered",
        answer: { kind: "rejected", codes: [10015], rejectionClass: "content" },
      },
    ],
  ])("tells the outcome of the cloud's %j", async (body, told) => {
    const { decisions } = cloud(ok(body));

    await expect(decisions.outcomeOf(QUESTION)).resolves.toEqual(told);
  });

  it("gets no answer when the cloud cannot be reached", async () => {
    const { decisions } = cloud({ kind: "unreachable" });

    await expect(decisions.outcomeOf(QUESTION)).resolves.toEqual({ kind: "no_answer" });
  });

  it("gets no answer when the cloud refuses", async () => {
    const { decisions } = cloud({ kind: "error", error: cloudError("rate_limited", "x") });

    await expect(decisions.outcomeOf(QUESTION)).resolves.toEqual({ kind: "no_answer" });
  });

  it("gets no answer when the body is not one the cloud answers", async () => {
    const { decisions } = cloud(ok({ state: "ADOPTED" }));

    await expect(decisions.outcomeOf(QUESTION)).resolves.toEqual({ kind: "no_answer" });
  });

  it("asks nothing and gets no answer without a device token", async () => {
    const { posts, decisions } = cloud(ok({ state: "RELEASED" }), null);

    await expect(decisions.outcomeOf(QUESTION)).resolves.toEqual({ kind: "no_answer" });
    expect(posts).toEqual([]);
  });
});
