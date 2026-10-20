import { cloudError, saleVoidCreditNoteRequestSchema } from "@purosur/contracts";
import type { PushedEvent } from "@purosur/domain";
import type { CloudCreditNoteCall } from "@purosur/domain/fiscal/use-cases";
import { describe, expect, it } from "vitest";
import type { CloudCallOptions, CloudResponse } from "../platform/cloud-client";
import { CloudCreditNotes } from "./cloud-credit-notes";
import { POINT_OF_SALE } from "./test-support/real-time-authorization-database";

const SALE_ID = "018f0000-0000-7000-8000-0000000000a1";
const CREDIT_NOTE_ID = "018f0000-0000-7000-8000-0000000000c1";

const SALE_EVENT: PushedEvent = {
  event_id: "018f0000-0000-7000-8000-000000000002",
  device_seq: 18,
  aggregate_type: "Sale",
  aggregate_id: SALE_ID,
  event_type: "sale_voided",
  schema_version: 3,
  payload: { id: SALE_ID },
  occurred_at: "2026-09-30T12:30:00.000Z",
  actor_id: "u1",
  chain_hmac: "hmac-2",
};

const CALL: CloudCreditNoteCall = {
  creditNoteId: CREDIT_NOTE_ID,
  pointOfSale: POINT_OF_SALE,
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
  const creditNotes = new CloudCreditNotes({
    timeoutMs: 5_000,
    readDeviceToken: async () => token ?? undefined,
    post: async (path, bearerToken, body, options) => {
      posts.push({ path, bearerToken, body, options });
      return answer;
    },
  });
  return { posts, creditNotes };
}

function ok(body: unknown): CloudResponse {
  return { kind: "ok", body };
}

function refused(code: Parameters<typeof cloudError>[0]): CloudResponse {
  return { kind: "error", error: cloudError(code, "x") };
}

describe("asking the cloud to issue the credit note of a voided sale", () => {
  it("posts the credit note, the point of sale and the void's event with the device token, once", async () => {
    const { posts, creditNotes } = cloud(ok({ state: "IN_PROGRESS" }));

    await creditNotes.request(CALL);

    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({
      path: "/api/fiscal/credit-notes",
      bearerToken: "prefix.secret",
      options: { timeoutMs: 5_000, singleAttempt: true },
    });
    expect(posts[0]?.body).toEqual({
      credit_note_id: CREDIT_NOTE_ID,
      point_of_sale: POINT_OF_SALE,
      sale_event: SALE_EVENT,
    });
    expect(saleVoidCreditNoteRequestSchema.safeParse(posts[0]?.body).success).toBe(true);
  });

  it("answers authorized with the number, date, moment of issue and code of the credit note", async () => {
    const { creditNotes } = cloud(
      ok({
        state: "AUTHORIZED",
        point_of_sale: POINT_OF_SALE,
        number: 7,
        issued_on: "2026-09-30",
        issued_at: "2026-09-30T15:40:01.000Z",
        authorization_code: "75123456789012",
        authorization_code_due_on: "2026-10-10",
      }),
    );

    await expect(creditNotes.request(CALL)).resolves.toEqual({
      kind: "authorized",
      pointOfSale: POINT_OF_SALE,
      number: 7,
      issuedOn: "2026-09-30",
      issuedAt: new Date("2026-09-30T15:40:01.000Z"),
      authorizationCode: "75123456789012",
      authorizationCodeDueOn: "2026-10-10",
    });
  });

  it("answers rejected", async () => {
    const { creditNotes } = cloud(ok({ state: "REJECTED" }));

    await expect(creditNotes.request(CALL)).resolves.toEqual({ kind: "rejected" });
  });

  it("answers in progress while the cloud has not resolved it", async () => {
    const { creditNotes } = cloud(ok({ state: "IN_PROGRESS" }));

    await expect(creditNotes.request(CALL)).resolves.toEqual({ kind: "in_progress" });
  });

  it("gives no answer when the cloud is unreachable", async () => {
    const { creditNotes } = cloud({ kind: "unreachable" });

    await expect(creditNotes.request(CALL)).resolves.toBeNull();
  });

  it.each(["validation_failed", "not_found", "rate_limited", "device_token_rejected"] as const)(
    "gives no answer when the cloud refuses with %s",
    async (code) => {
      const { creditNotes } = cloud(refused(code));

      await expect(creditNotes.request(CALL)).resolves.toBeNull();
    },
  );

  it("answers already credited when the cloud refuses because the invoice has a credit note", async () => {
    const { creditNotes } = cloud(refused("conflict"));

    await expect(creditNotes.request(CALL)).resolves.toEqual({ kind: "already_credited" });
  });

  it("gives no answer to a body it does not understand", async () => {
    const { creditNotes } = cloud(ok({ state: "AUTHORIZED" }));

    await expect(creditNotes.request(CALL)).resolves.toBeNull();
  });

  it("gives no answer, and asks nothing, while the register holds no device token", async () => {
    const { posts, creditNotes } = cloud(ok({ state: "IN_PROGRESS" }), null);

    await expect(creditNotes.request(CALL)).resolves.toBeNull();
    expect(posts).toEqual([]);
  });
});
