import type { AuthorizationRequestRecord } from "@purosur/domain/fiscal/use-cases";
import { configureRegisterPointOfSale } from "@purosur/domain/fiscal/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { fiscalAddresses, registers, users } from "../../platform/db/schema.js";
import { seededLocationId } from "../../test-support/seeded-location.js";
import { DrizzleRegisterPointOfSaleStore } from "../drizzle-register-point-of-sale-store.js";

export const RECEIVED_AT = new Date("2026-10-06T15:00:00.000Z");

type PushedEvent = AuthorizationRequestRecord["saleEvent"];

export function saleCompletedEvent(saleId: string): PushedEvent {
  return {
    event_id: crypto.randomUUID(),
    device_seq: 7,
    aggregate_type: "sale",
    aggregate_id: saleId,
    event_type: "sale_completed",
    schema_version: 1,
    payload: { total: 1500 },
    occurred_at: "2026-10-06T14:59:58.000Z",
    actor_id: "user-1",
    chain_hmac: "hmac",
  };
}

export function authorizationRequestRecord(
  registerId: string,
  overrides: Partial<AuthorizationRequestRecord> = {},
): AuthorizationRequestRecord {
  const saleId = overrides.saleId ?? crypto.randomUUID();
  return {
    fiscalDocumentId: crypto.randomUUID(),
    registerId,
    saleId,
    pointOfSale: 7,
    number: 42,
    issuedOn: "2026-10-06",
    total: 1500,
    buyerTaxStatusCode: 5,
    notAfter: new Date(RECEIVED_AT.getTime() + 4_000),
    saleEvent: saleCompletedEvent(saleId),
    receivedAt: RECEIVED_AT,
    ...overrides,
  };
}

export async function insertRegisterWithPointOfSale<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  { pointOfSaleNumber, name }: { pointOfSaleNumber: number; name: string },
): Promise<string> {
  const locationId = await seededLocationId(db);
  const [actor] = await db
    .insert(users)
    .values({ firstName: "Marta Quiroga", email: `${name}@example.com`, locationId })
    .returning({ id: users.id });
  const [fiscalAddress] = await db
    .insert(fiscalAddresses)
    .values({ name: `Deposito ${name}`, streetAddress: "Calle Ficticia 123, CABA" })
    .returning({ id: fiscalAddresses.id });
  const [register] = await db
    .insert(registers)
    .values({ locationId, name })
    .returning({ id: registers.id });
  if (!actor || !fiscalAddress || !register) {
    throw new Error("test setup: seeding the register returned no row");
  }
  await configureRegisterPointOfSale(new DrizzleRegisterPointOfSaleStore(db, () => RECEIVED_AT), {
    locationId,
    registerId: register.id,
    pointOfSaleNumber,
    fiscalAddressId: fiscalAddress.id,
    version: 0,
    actorId: actor.id,
  });
  return register.id;
}
