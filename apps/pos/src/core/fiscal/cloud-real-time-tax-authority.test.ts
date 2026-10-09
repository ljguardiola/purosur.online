import { cloudError, realTimeAuthorizationRequestSchema } from "@purosur/contracts";
import type { PushedEvent } from "@purosur/domain";
import type { RealTimeAuthorizationCall } from "@purosur/domain/fiscal/use-cases";
import { describe, expect, it } from "vitest";
import type { CloudCallOptions, CloudResponse } from "../platform/cloud-client";
import { CloudRealTimeTaxAuthority } from "./cloud-real-time-tax-authority";
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

const CALL: RealTimeAuthorizationCall = {
  fiscalDocumentId: "018f0000-0000-7000-8000-0000000000d1",
  saleId: SALE_ID,
  pointOfSale: POINT_OF_SALE,
  number: 41,
  issuedOn: "2026-09-30",
  document: FACTURA_C,
  saleEvent: SALE_EVENT,
  timeoutMs: 5_000,
  roundTripMedianMs: 200,
};

interface Post {
  path: string;
  bearerToken: string;
  body: unknown;
  options: CloudCallOptions;
}

function authority(answer: CloudResponse, token: string | null = "prefix.secret") {
  const posts: Post[] = [];
  const taxAuthority = new CloudRealTimeTaxAuthority({
    readDeviceToken: async () => token ?? undefined,
    post: async (path, bearerToken, body, options) => {
      posts.push({ path, bearerToken, body, options });
      return answer;
    },
  });
  return { posts, taxAuthority };
}

function ok(body: unknown): CloudResponse {
  return { kind: "ok", body };
}

function refused(code: Parameters<typeof cloudError>[0]): CloudResponse {
  return { kind: "error", error: cloudError(code, "x") };
}

describe("asking the cloud to authorize a fiscal document", () => {
  it("posts the document, the sale's event, the time budget and the round trip with the device token, once", async () => {
    const { posts, taxAuthority } = authority(ok({ state: "UNCLEAR" }));

    await taxAuthority.authorize(CALL);

    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({
      path: "/api/fiscal/authorize",
      bearerToken: "prefix.secret",
      options: { timeoutMs: 5_000, singleAttempt: true },
    });
    expect(posts[0]?.body).toEqual({
      fiscal_document_id: CALL.fiscalDocumentId,
      sale_id: SALE_ID,
      point_of_sale: POINT_OF_SALE,
      number: 41,
      issued_on: "2026-09-30",
      total: 12_500,
      buyer_tax_status_code: 5,
      timeout_ms: 5_000,
      rtt_median_ms: 200,
      sale_event: SALE_EVENT,
    });
    expect(realTimeAuthorizationRequestSchema.safeParse(posts[0]?.body).success).toBe(true);
  });

  it("answers authorized with the code and its expiry", async () => {
    const { taxAuthority } = authority(
      ok({
        state: "AUTHORIZED",
        authorization_code: "75123456789012",
        authorization_code_due_on: "2026-10-10",
      }),
    );

    await expect(taxAuthority.authorize(CALL)).resolves.toEqual({
      kind: "authorized",
      authorizationCode: "75123456789012",
      authorizationCodeDueOn: "2026-10-10",
    });
  });

  it("answers rejected with the codes of the rejection", async () => {
    const { taxAuthority } = authority(ok({ state: "REJECTED", rejection_codes: [10015, 10048] }));

    await expect(taxAuthority.authorize(CALL)).resolves.toEqual({
      kind: "rejected",
      codes: [10015, 10048],
    });
  });

  it("answers not attempted when the cloud made no call to the tax authority", async () => {
    const { taxAuthority } = authority(ok({ state: "NOT_ATTEMPTED" }));

    await expect(taxAuthority.authorize(CALL)).resolves.toEqual({ kind: "not_attempted" });
  });

  it("answers unclear when the cloud does", async () => {
    const { taxAuthority } = authority(ok({ state: "UNCLEAR" }));

    await expect(taxAuthority.authorize(CALL)).resolves.toEqual({ kind: "unclear" });
  });

  it("answers not attempted when the cloud limits the installation's requests", async () => {
    const { taxAuthority } = authority(refused("rate_limited"));

    await expect(taxAuthority.authorize(CALL)).resolves.toEqual({ kind: "not_attempted" });
  });

  it.each([
    ["the cloud is unreachable or too slow", { kind: "unreachable" } satisfies CloudResponse],
    ["the cloud does not know the document", refused("not_found")],
    ["the cloud refuses the request", refused("validation_failed")],
    ["the device token is rejected", refused("device_token_rejected")],
    ["the installation was revoked", refused("revoked")],
    ["the cloud is unavailable", refused("server_unavailable")],
    ["the cloud fails", refused("internal_error")],
    ["the answer is not one of the contract's", ok({ state: "AUTHORIZED" })],
    ["the answer has no body", ok(undefined)],
  ])("answers unclear when %s", async (_case, answer) => {
    const { taxAuthority } = authority(answer);

    await expect(taxAuthority.authorize(CALL)).resolves.toEqual({ kind: "unclear" });
  });

  it("answers not attempted, sending nothing, when the register holds no device token", async () => {
    const { posts, taxAuthority } = authority(ok({ state: "UNCLEAR" }), null);

    await expect(taxAuthority.authorize(CALL)).resolves.toEqual({ kind: "not_attempted" });
    expect(posts).toEqual([]);
  });
});
