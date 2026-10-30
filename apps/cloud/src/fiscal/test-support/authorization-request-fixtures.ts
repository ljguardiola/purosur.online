import type { AuthorizationRequestRecord } from "@purosur/domain/fiscal/use-cases";
import { configureRegisterPointOfSale } from "@purosur/domain/fiscal/use-cases";
import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  cashSessions,
  fiscalAddresses,
  registerInstallations,
  registers,
  sales,
  users,
} from "../../platform/db/schema.js";
import { insertEnrolledInstallation } from "../../register/test-support/enrolled-installation.js";
import { seededLocationId } from "../../test-support/seeded-location.js";
import { DrizzleRegisterPointOfSaleStore } from "../drizzle-register-point-of-sale-store.js";

export const RECEIVED_AT = new Date("2026-10-06T15:00:00.000Z");

type PushedEvent = NonNullable<AuthorizationRequestRecord["saleEvent"]>;

let completedEvents = 0;

export function saleCompletedEvent(saleId: string): PushedEvent {
  completedEvents += 1;
  return {
    event_id: crypto.randomUUID(),
    device_seq: completedEvents * 10,
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

export async function insertSaleOfRegister<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  registerId: string,
  saleId: string,
  state: "COMPLETED" | "CANCELLED" | "VOIDED" = "COMPLETED",
): Promise<void> {
  const [installed] = await db
    .select({ id: registerInstallations.id })
    .from(registerInstallations)
    .where(eq(registerInstallations.registerId, registerId));
  const deviceId =
    installed?.id ??
    (await insertEnrolledInstallation(db, { now: RECEIVED_AT, existingRegisterId: registerId }))
      .deviceId;
  const origin = { locationId: await seededLocationId(db), registerId, deviceId };
  const actorId = crypto.randomUUID();
  const sessionId = crypto.randomUUID();
  await db.insert(cashSessions).values({
    id: sessionId,
    ...origin,
    openedBy: actorId,
    openedAt: RECEIVED_AT,
    openingFloat: 0,
  });
  await db.insert(sales).values({
    id: saleId,
    ...origin,
    sessionId,
    actorId,
    state,
    completedAt: state === "CANCELLED" ? null : RECEIVED_AT,
    cancelledAt: state === "CANCELLED" ? RECEIVED_AT : null,
    voidedAt: state === "VOIDED" ? RECEIVED_AT : null,
    total: 1500,
    appliedAt: RECEIVED_AT,
  });
}

export function saleVoidedEvent(
  saleId: string,
  creditNote: {
    id: string;
    total: number;
    corrects: { voucherType: number; pointOfSale: number; number: number };
  },
): PushedEvent {
  return {
    event_id: crypto.randomUUID(),
    device_seq: 8,
    aggregate_type: "sale",
    aggregate_id: saleId,
    event_type: "sale_voided",
    schema_version: 4,
    payload: {
      credit_note: {
        id: creditNote.id,
        total: creditNote.total,
        receiver_tax_status_code: 5,
        corrects: {
          voucher_type: creditNote.corrects.voucherType,
          point_of_sale: creditNote.corrects.pointOfSale,
          number: creditNote.corrects.number,
        },
      },
    },
    occurred_at: "2026-10-08T01:29:58.000Z",
    actor_id: "user-1",
    chain_hmac: "hmac",
  };
}

export function saleReturnedEvent(
  saleId: string,
  returnId: string,
  creditNote: {
    id: string;
    total: number;
    issuedOn: string;
    corrects: { voucherType: number; pointOfSale: number; number: number };
  },
): PushedEvent {
  return {
    event_id: crypto.randomUUID(),
    device_seq: 9,
    aggregate_type: "Return",
    aggregate_id: returnId,
    event_type: "sale_returned",
    schema_version: 3,
    payload: {
      id: returnId,
      sale_id: saleId,
      credit_note: {
        id: creditNote.id,
        total: creditNote.total,
        receiver_tax_status_code: 5,
        issued_on: creditNote.issuedOn,
        corrects: {
          voucher_type: creditNote.corrects.voucherType,
          point_of_sale: creditNote.corrects.pointOfSale,
          number: creditNote.corrects.number,
        },
      },
    },
    occurred_at: "2026-10-08T01:29:58.000Z",
    actor_id: "user-1",
    chain_hmac: "hmac",
  };
}
