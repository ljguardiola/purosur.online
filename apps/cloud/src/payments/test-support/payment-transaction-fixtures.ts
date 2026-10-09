import type { ProviderPaymentTransaction } from "@purosur/domain";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { registers } from "../../platform/db/schema.js";
import { seededLocationId } from "../../test-support/seeded-location.js";

export const CREATED_AT = new Date("2026-10-09T12:00:00.000Z");
const EXPIRES_AT = new Date("2026-10-09T12:05:00.000Z");

export function pendingTransaction(
  registerId: string,
  overrides: Partial<ProviderPaymentTransaction> = {},
): ProviderPaymentTransaction {
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
    createdAt: CREATED_AT,
    expiresAt: EXPIRES_AT,
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
