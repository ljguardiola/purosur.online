import {
  approvedOrdersOfRegisterSchema,
  cloudErrorSchema,
  latePaymentRefundOpeningSchema,
  latePaymentRefundRefusalDetailSchema,
} from "@purosur/contracts";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  installationRequestAttempts,
  paymentRefunds,
  paymentTransactions,
} from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { insertRequestsUpToLimit } from "../sync/test-support/admitted-requests.js";
import { NOW } from "./test-support/fake-mercado-pago-orders.js";
import { paidOrdersOfRegisterRoutesUnderTest } from "./test-support/paid-orders-of-register-routes-under-test.js";
import { pendingTransaction } from "./test-support/payment-transaction-fixtures.js";

const route = paidOrdersOfRegisterRoutesUnderTest();

function hoursBeforeNow(hours: number): Date {
  return new Date(NOW.getTime() - hours * 60 * 60 * 1000);
}

function enroll(registerName = "Caja 1") {
  return insertEnrolledInstallation(route.db, { now: NOW, registerName });
}

function listApproved(authorization?: string) {
  return route.app.inject({
    method: "GET",
    url: "/payments/mercado-pago/approved",
    ...(authorization !== undefined && { headers: { authorization } }),
  });
}

function openLatePaymentRefund(id: string, authorization?: string) {
  return route.app.inject({
    method: "POST",
    url: `/payments/mercado-pago/${id}/late-payment-refund`,
    ...(authorization !== undefined && { headers: { authorization } }),
  });
}

const asks = [
  ["listing the approved orders", listApproved],
  [
    "opening a late payment refund",
    (authorization?: string) => openLatePaymentRefund(crypto.randomUUID(), authorization),
  ],
] as const;

describe("the paid orders of a register routes", () => {
  describe.each(asks)("who may ask, %s", (_name, ask) => {
    it("refuses a request that carries no device token", async () => {
      const response = await ask();

      expect(response.statusCode).toBe(401);
      expect(response.headers["www-authenticate"]).toBe("Bearer");
      expect(cloudErrorSchema.parse(response.json()).code).toBe("device_token_rejected");
    });

    it("refuses a device token no installation holds", async () => {
      const response = await ask("Bearer not-a-known-token");

      expect(response.statusCode).toBe(401);
    });

    it("refuses a revoked installation", async () => {
      const revoked = await insertEnrolledInstallation(route.db, {
        now: NOW,
        revokedAt: new Date(NOW.getTime() - 1_000),
      });

      const response = await ask(`Bearer ${revoked.deviceToken}`);

      expect(response.statusCode).toBe(403);
      expect(cloudErrorSchema.parse(response.json()).code).toBe("revoked");
    });

    it("counts each admitted request as a payment order request of its installation", async () => {
      const { deviceId, deviceToken } = await enroll();

      await ask(`Bearer ${deviceToken}`);

      expect(
        await route.db
          .select({ endpoint: installationRequestAttempts.endpoint })
          .from(installationRequestAttempts)
          .where(eq(installationRequestAttempts.deviceId, deviceId)),
      ).toEqual([{ endpoint: "payment_order" }]);
    });

    it("refuses a request past the installation's limit with when to retry", async () => {
      const { deviceId, deviceToken } = await enroll();
      await insertRequestsUpToLimit(
        route.db,
        deviceId,
        "payment_order",
        new Date(NOW.getTime() - 59 * 60 * 1000),
      );

      const response = await ask(`Bearer ${deviceToken}`);

      expect(response.statusCode).toBe(429);
      expect(response.headers["retry-after"]).toBe("60");
    });
  });

  describe("GET /payments/mercado-pago/approved", () => {
    it("answers the register's approved orders of the last 72 hours", async () => {
      const { registerId, deviceToken } = await enroll();
      const paid = pendingTransaction(registerId, {
        state: "APPROVED",
        createdAt: hoursBeforeNow(5),
      });
      await route.db.insert(paymentTransactions).values(paid);

      const response = await listApproved(`Bearer ${deviceToken}`);

      expect(response.statusCode).toBe(200);
      expect(approvedOrdersOfRegisterSchema.parse(response.json())).toEqual({
        orders: [
          {
            payment_transaction_id: paid.id,
            sale_id: paid.saleId,
            method: "QR",
            provider: "MERCADOPAGO_QR",
            amount: 5000,
            created_at: hoursBeforeNow(5).toISOString(),
          },
        ],
      });
    });

    it("leaves out what is not an approved order of this register in the window", async () => {
      const { registerId, deviceToken } = await enroll();
      const other = await enroll("Caja 2");
      const inWindow = hoursBeforeNow(5);
      await route.db
        .insert(paymentTransactions)
        .values([
          pendingTransaction(registerId, { state: "PENDING", createdAt: inWindow }),
          pendingTransaction(registerId, {
            state: "APPROVED",
            replaced: true,
            createdAt: inWindow,
          }),
          pendingTransaction(registerId, { state: "APPROVED", createdAt: hoursBeforeNow(73) }),
          pendingTransaction(other.registerId, { state: "APPROVED", createdAt: inWindow }),
        ]);

      const response = await listApproved(`Bearer ${deviceToken}`);

      expect(approvedOrdersOfRegisterSchema.parse(response.json())).toEqual({ orders: [] });
    });
  });

  describe("POST /payments/mercado-pago/:id/late-payment-refund", () => {
    async function approvedPayment(overrides: Parameters<typeof pendingTransaction>[1] = {}) {
      const installation = await enroll();
      const transaction = pendingTransaction(installation.registerId, {
        state: "APPROVED",
        createdAt: hoursBeforeNow(5),
        ...overrides,
      });
      await route.db.insert(paymentTransactions).values(transaction);
      return { ...installation, transaction };
    }

    function refundsOf(paymentTransactionId: string) {
      return route.db
        .select()
        .from(paymentRefunds)
        .where(eq(paymentRefunds.paymentTransactionId, paymentTransactionId));
    }

    it("opens one pending late payment refund of the approved order", async () => {
      const { deviceToken, transaction } = await approvedPayment();

      const response = await openLatePaymentRefund(transaction.id, `Bearer ${deviceToken}`);

      expect(response.statusCode).toBe(200);
      expect(latePaymentRefundOpeningSchema.parse(response.json())).toEqual({
        payment_transaction_id: transaction.id,
        opening: "opened",
      });
      expect(await refundsOf(transaction.id)).toEqual([
        expect.objectContaining({
          origin: "late_payment",
          state: "PENDING",
          amount: 5000,
          method: "QR",
          providerOrderId: null,
        }),
      ]);
    });

    it("answers that it was already open, leaving one refund, when asked again", async () => {
      const { deviceToken, transaction } = await approvedPayment();
      await openLatePaymentRefund(transaction.id, `Bearer ${deviceToken}`);

      const again = await openLatePaymentRefund(transaction.id, `Bearer ${deviceToken}`);

      expect(again.statusCode).toBe(200);
      expect(latePaymentRefundOpeningSchema.parse(again.json()).opening).toBe("already_open");
      expect(await refundsOf(transaction.id)).toHaveLength(1);
    });

    it("answers not found for a payment of another register, opening nothing", async () => {
      const { transaction } = await approvedPayment();
      const stranger = await enroll("Caja 2");

      const response = await openLatePaymentRefund(
        transaction.id,
        `Bearer ${stranger.deviceToken}`,
      );

      expect(response.statusCode).toBe(404);
      expect(cloudErrorSchema.parse(response.json()).code).toBe("not_found");
      expect(await refundsOf(transaction.id)).toEqual([]);
    });

    it("answers not found for a payment that does not exist", async () => {
      const { deviceToken } = await enroll();

      const response = await openLatePaymentRefund(crypto.randomUUID(), `Bearer ${deviceToken}`);

      expect(response.statusCode).toBe(404);
    });

    it("refuses a payment that is not a record id", async () => {
      const { deviceToken } = await enroll();

      const response = await openLatePaymentRefund("not-an-id", `Bearer ${deviceToken}`);

      expect(response.statusCode).toBe(400);
    });

    it("refuses an order that is not approved, saying so", async () => {
      const { deviceToken, transaction } = await approvedPayment({ state: "PENDING" });

      const response = await openLatePaymentRefund(transaction.id, `Bearer ${deviceToken}`);

      expect(response.statusCode).toBe(409);
      const error = cloudErrorSchema.parse(response.json());
      expect(error.code).toBe("conflict");
      expect(latePaymentRefundRefusalDetailSchema.parse(error.details[0])).toEqual({
        refusal: "not_approved",
      });
      expect(await refundsOf(transaction.id)).toEqual([]);
    });

    it("refuses an approved order another order replaced, saying so", async () => {
      const { deviceToken, transaction } = await approvedPayment({ replaced: true });

      const response = await openLatePaymentRefund(transaction.id, `Bearer ${deviceToken}`);

      expect(response.statusCode).toBe(409);
      const error = cloudErrorSchema.parse(response.json());
      expect(latePaymentRefundRefusalDetailSchema.parse(error.details[0])).toEqual({
        refusal: "replaced",
      });
      expect(await refundsOf(transaction.id)).toEqual([]);
    });
  });
});
