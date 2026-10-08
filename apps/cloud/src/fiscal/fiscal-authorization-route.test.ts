import {
  cloudErrorSchema,
  type RealTimeAuthorizationRequestBody,
  realTimeAuthorizationResponseSchema,
} from "@purosur/contracts";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  arcaInvoicingEvidence,
  fiscalRequests,
  installationRequestAttempts,
} from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { insertRequestsUpToLimit } from "../sync/test-support/admitted-requests.js";
import {
  insertRegisterWithPointOfSale,
  saleCompletedEvent,
} from "./test-support/authorization-request-fixtures.js";
import {
  fiscalAuthorizationRouteUnderTest,
  NOW,
} from "./test-support/fiscal-authorization-under-test.js";

const route = fiscalAuthorizationRouteUnderTest();

function requestBody(
  overrides: Partial<RealTimeAuthorizationRequestBody> = {},
): RealTimeAuthorizationRequestBody {
  const saleId = overrides.sale_id ?? crypto.randomUUID();
  return {
    fiscal_document_id: crypto.randomUUID(),
    sale_id: saleId,
    point_of_sale: 7,
    number: 42,
    issued_on: "2026-10-06",
    total: 1500,
    buyer_tax_status_code: 5,
    timeout_ms: 5_000,
    rtt_median_ms: 200,
    sale_event: saleCompletedEvent(saleId),
    ...overrides,
  };
}

async function enrollRegisterWithPointOfSale(pointOfSaleNumber = 7) {
  const registerId = await insertRegisterWithPointOfSale(route.db, {
    pointOfSaleNumber,
    name: `caja-${pointOfSaleNumber}`,
  });
  return insertEnrolledInstallation(route.db, { now: NOW, existingRegisterId: registerId });
}

function authorize(payload: unknown, authorization?: string) {
  return route.app.inject({
    method: "POST",
    url: "/fiscal/authorize",
    payload: payload as object,
    ...(authorization !== undefined && { headers: { authorization } }),
  });
}

async function requests() {
  return route.db.select().from(fiscalRequests);
}

describe("POST /fiscal/authorize", () => {
  describe("who may ask", () => {
    it("refuses a request that carries no device token, without calling the tax authority", async () => {
      const response = await authorize(requestBody());

      expect(response.statusCode).toBe(401);
      expect(cloudErrorSchema.parse(response.json()).code).toBe("device_token_rejected");
      expect(route.taxAuthority.solicitations).toEqual([]);
      expect(await requests()).toEqual([]);
    });

    it("refuses a device token no installation holds", async () => {
      const response = await authorize(requestBody(), "Bearer not-a-known-token");

      expect(response.statusCode).toBe(401);
      expect(cloudErrorSchema.parse(response.json()).code).toBe("device_token_rejected");
      expect(await requests()).toEqual([]);
    });

    it("refuses a revoked installation", async () => {
      await enrollRegisterWithPointOfSale();
      const revoked = await insertEnrolledInstallation(route.db, {
        now: NOW,
        revokedAt: new Date(NOW.getTime() - 1_000),
      });

      const response = await authorize(requestBody(), `Bearer ${revoked.deviceToken}`);

      expect(response.statusCode).toBe(403);
      expect(cloudErrorSchema.parse(response.json()).code).toBe("revoked");
      expect(route.taxAuthority.solicitations).toEqual([]);
      expect(await requests()).toEqual([]);
    });

    it("refuses a point of sale that belongs to another register, recording nothing", async () => {
      await enrollRegisterWithPointOfSale(7);
      const other = await enrollRegisterWithPointOfSale(8);

      const response = await authorize(
        requestBody({ point_of_sale: 7 }),
        `Bearer ${other.deviceToken}`,
      );

      expect(response.statusCode).toBe(404);
      expect(cloudErrorSchema.parse(response.json()).code).toBe("not_found");
      expect(route.taxAuthority.solicitations).toEqual([]);
      expect(await requests()).toEqual([]);
    });

    it("refuses a fiscal document id another register recorded, leaving its request and answer as they were", async () => {
      const owner = await enrollRegisterWithPointOfSale(7);
      const other = await enrollRegisterWithPointOfSale(8);
      await route.issueWsaaToken();
      const body = requestBody({ point_of_sale: 7 });
      await authorize(body, `Bearer ${owner.deviceToken}`);
      route.taxAuthority.solicitations.length = 0;

      const response = await authorize(
        { ...body, point_of_sale: 8 },
        `Bearer ${other.deviceToken}`,
      );

      expect(response.statusCode).toBe(404);
      expect(cloudErrorSchema.parse(response.json()).code).toBe("not_found");
      expect(route.taxAuthority.solicitations).toEqual([]);
      const rows = await requests();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ registerId: owner.registerId, pointOfSale: 7 });
    });
  });

  describe("how many requests an installation may make", () => {
    it("records each admitted request as a fiscal authorization request of its installation", async () => {
      const { deviceId, deviceToken } = await enrollRegisterWithPointOfSale();

      await authorize(requestBody(), `Bearer ${deviceToken}`);

      expect(
        await route.db
          .select({ endpoint: installationRequestAttempts.endpoint })
          .from(installationRequestAttempts)
          .where(eq(installationRequestAttempts.deviceId, deviceId)),
      ).toEqual([{ endpoint: "fiscal_authorize" }]);
    });

    it("refuses a request past the installation's limit with when to retry, recording nothing and not calling the tax authority", async () => {
      const { deviceId, deviceToken } = await enrollRegisterWithPointOfSale();
      await route.issueWsaaToken();
      await insertRequestsUpToLimit(
        route.db,
        deviceId,
        "fiscal_authorize",
        new Date(NOW.getTime() - 59 * 60 * 1000),
      );

      const response = await authorize(requestBody(), `Bearer ${deviceToken}`);

      expect(response.statusCode).toBe(429);
      expect(response.headers["retry-after"]).toBe("60");
      expect(cloudErrorSchema.parse(response.json())).toEqual({
        code: "rate_limited",
        message: "too many requests",
        details: [{ retry_after_seconds: 60 }],
      });
      expect(route.taxAuthority.solicitations).toEqual([]);
      expect(await requests()).toEqual([]);
    });

    it("refuses an over-limit request before reading its body", async () => {
      const { deviceId, deviceToken } = await enrollRegisterWithPointOfSale();
      await insertRequestsUpToLimit(route.db, deviceId, "fiscal_authorize", NOW);

      const response = await authorize({ number: "forty-two" }, `Bearer ${deviceToken}`);

      expect(response.statusCode).toBe(429);
    });
  });

  describe("what it reads", () => {
    it("refuses a body that is not a real-time authorization request", async () => {
      const { deviceToken } = await enrollRegisterWithPointOfSale();

      const response = await authorize({ number: "forty-two" }, `Bearer ${deviceToken}`);

      expect(response.statusCode).toBe(400);
      expect(cloudErrorSchema.parse(response.json()).code).toBe("validation_failed");
      expect(await requests()).toEqual([]);
    });

    it("refuses an event that is not the completion of the sale it asks to authorize", async () => {
      const { deviceToken } = await enrollRegisterWithPointOfSale();
      const body = requestBody();

      const response = await authorize(
        { ...body, sale_event: saleCompletedEvent(crypto.randomUUID()) },
        `Bearer ${deviceToken}`,
      );

      expect(response.statusCode).toBe(400);
      expect(cloudErrorSchema.parse(response.json()).code).toBe("validation_failed");
      expect(route.taxAuthority.solicitations).toEqual([]);
      expect(await requests()).toEqual([]);
    });
  });

  describe("what it answers", () => {
    it("keeps the request and its sale event, asks the tax authority and answers AUTHORIZED", async () => {
      const { deviceToken, registerId } = await enrollRegisterWithPointOfSale();
      await route.issueWsaaToken();
      route.taxAuthority.answer = {
        kind: "authorized",
        authorizationCode: "74123456789012",
        authorizationCodeDueOn: "2026-10-16",
      };
      const body = requestBody();

      const response = await authorize(body, `Bearer ${deviceToken}`);

      expect(response.statusCode).toBe(200);
      expect(realTimeAuthorizationResponseSchema.parse(response.json())).toEqual({
        state: "AUTHORIZED",
        authorization_code: "74123456789012",
        authorization_code_due_on: "2026-10-16",
      });
      expect(route.taxAuthority.solicitations).toEqual([
        {
          token: expect.objectContaining({ token: "FICTIONAL-TOKEN" }),
          pointOfSale: 7,
          number: 42,
          issuedOn: "2026-10-06",
          total: 1500,
          buyerTaxStatusCode: 5,
        },
      ]);
      const [row] = await route.db
        .select()
        .from(fiscalRequests)
        .where(eq(fiscalRequests.fiscalDocumentId, body.fiscal_document_id));
      expect(row).toMatchObject({
        registerId,
        saleId: body.sale_id,
        saleEvent: body.sale_event,
        receivedAt: NOW,
        answerKind: "authorized",
        authorizationCode: "74123456789012",
      });
      const evidence = await route.db.select().from(arcaInvoicingEvidence);
      expect(evidence.map((entry) => entry.lastCallOkAt)).toEqual([NOW]);
    });

    it("answers REJECTED with the codes the tax authority gave", async () => {
      const { deviceToken } = await enrollRegisterWithPointOfSale();
      await route.issueWsaaToken();
      route.taxAuthority.answer = { kind: "rejected", codes: [10015] };

      const response = await authorize(requestBody(), `Bearer ${deviceToken}`);

      expect(realTimeAuthorizationResponseSchema.parse(response.json())).toEqual({
        state: "REJECTED",
        rejection_codes: [10015],
      });
    });

    it("answers UNCLEAR when the tax authority gave no answer", async () => {
      const { deviceToken } = await enrollRegisterWithPointOfSale();
      await route.issueWsaaToken();
      route.taxAuthority.answer = { kind: "no_answer" };

      const response = await authorize(requestBody(), `Bearer ${deviceToken}`);

      expect(realTimeAuthorizationResponseSchema.parse(response.json())).toEqual({
        state: "UNCLEAR",
      });
    });

    it("answers NOT_ATTEMPTED without calling the tax authority when the budget already ran out", async () => {
      const { deviceToken } = await enrollRegisterWithPointOfSale();
      await route.issueWsaaToken();

      const response = await authorize(requestBody({ timeout_ms: 100 }), `Bearer ${deviceToken}`);

      expect(realTimeAuthorizationResponseSchema.parse(response.json())).toEqual({
        state: "NOT_ATTEMPTED",
      });
      expect(route.taxAuthority.solicitations).toEqual([]);
      expect((await requests()).map((row) => row.answerKind)).toEqual(["not_attempted"]);
    });

    it("answers NOT_ATTEMPTED when the cloud holds no valid WSAA token", async () => {
      const { deviceToken } = await enrollRegisterWithPointOfSale();

      const response = await authorize(requestBody(), `Bearer ${deviceToken}`);

      expect(realTimeAuthorizationResponseSchema.parse(response.json())).toEqual({
        state: "NOT_ATTEMPTED",
      });
      expect(route.taxAuthority.solicitations).toEqual([]);
    });
  });
});
