import type { MercadoPagoOrderTransaction, PaymentTransactionState } from "@purosur/domain";
import { and, eq, isNull } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  cashSessions,
  registerInstallations,
  registers,
  salePayments,
  sales,
} from "../../platform/db/schema.js";
import { insertEnrolledInstallation } from "../../register/test-support/enrolled-installation.js";
import { seededLocationId } from "../../test-support/seeded-location.js";

export const CREATED_AT = new Date("2026-10-09T12:00:00.000Z");
const EXPIRES_AT = new Date("2026-10-09T12:05:00.000Z");

type QrOrderTransaction = Extract<MercadoPagoOrderTransaction, { method: "QR" }>;

export function pendingTransaction(
  registerId: string,
  overrides: Partial<QrOrderTransaction> = {},
): QrOrderTransaction {
  return {
    id: crypto.randomUUID(),
    registerId,
    saleId: crypto.randomUUID(),
    kind: "SALE",
    method: "QR",
    provider: "MERCADOPAGO_QR",
    amount: 5000,
    state: "PENDING",
    needsReview: false,
    providerOrderId: null,
    creationOutcomeUnknown: false,
    replaced: false,
    createdAt: CREATED_AT,
    expiresAt: EXPIRES_AT,
    ...overrides,
  };
}

type PointOrderTransaction = Extract<MercadoPagoOrderTransaction, { method: "POINT" }>;

export function pendingPointTransaction(
  registerId: string,
  overrides: Partial<PointOrderTransaction> = {},
): PointOrderTransaction {
  return {
    ...pendingTransaction(registerId),
    method: "POINT",
    provider: "MERCADOPAGO_POINT",
    ...overrides,
  };
}

export async function insertRegister<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  name: string,
): Promise<string> {
  const locationId = await seededLocationId(db);
  const [register] = await db
    .insert(registers)
    .values({ locationId, name })
    .returning({ id: registers.id });
  if (!register) {
    throw new Error("test setup: seeding the register returned no row");
  }
  return register.id;
}

export async function insertSyncedSaleHolding<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  transaction: MercadoPagoOrderTransaction,
  salePaymentState: PaymentTransactionState,
): Promise<void> {
  const [enrolled] = await db
    .select({ deviceId: registerInstallations.id })
    .from(registerInstallations)
    .where(
      and(
        eq(registerInstallations.registerId, transaction.registerId),
        isNull(registerInstallations.revokedAt),
      ),
    );
  const deviceId =
    enrolled?.deviceId ??
    (
      await insertEnrolledInstallation(db, {
        now: transaction.createdAt,
        existingRegisterId: transaction.registerId,
      })
    ).deviceId;
  const origin = {
    locationId: await seededLocationId(db),
    registerId: transaction.registerId,
    deviceId,
  };
  const actorId = crypto.randomUUID();
  const sessionId = crypto.randomUUID();
  await db.insert(cashSessions).values({
    id: sessionId,
    ...origin,
    openedBy: actorId,
    openedAt: transaction.createdAt,
    openingFloat: 0,
  });
  await db.insert(sales).values({
    id: transaction.saleId,
    ...origin,
    sessionId,
    actorId,
    state: "COMPLETED",
    completedAt: transaction.createdAt,
    total: transaction.amount,
    appliedAt: transaction.createdAt,
  });
  await db.insert(salePayments).values({
    id: transaction.id,
    saleId: transaction.saleId,
    method: transaction.method,
    provider: transaction.provider,
    amount: transaction.amount,
    state: salePaymentState,
    occurredAt: transaction.createdAt,
  });
}
