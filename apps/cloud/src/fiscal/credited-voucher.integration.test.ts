import { randomUUID } from "node:crypto";
import { VoucherAlreadyCredited } from "@purosur/domain/fiscal/use-cases";
import { eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { creditNotes, offlineFiscalDocuments } from "../platform/db/schema.js";
import { postgresDedicatedConnections } from "../platform/dedicated-connections.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import {
  creditedVoucherLockKey,
  lockCreditedVoucher,
  voucherCreditedOnline,
} from "./credited-voucher.js";
import { DrizzleSaleCreditNoteLanes } from "./drizzle-sale-void-credit-notes.js";
import { insertRegisterWithPointOfSale } from "./test-support/authorization-request-fixtures.js";

const FORTNIGHT = { start: "2026-10-01", end: "2026-10-15" };
const RECEIVED_AT = new Date("2026-10-08T01:00:00.000Z");

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;
let registerId: string;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("credited_voucher");
  sql = postgres(integrationDb.databaseUrl, { max: 8 });
  db = drizzle(sql);
  registerId = await insertRegisterWithPointOfSale(db, { pointOfSaleNumber: 7, name: "caja-1" });
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

async function waitingAdvisoryLocks(): Promise<number> {
  const [row] = await sql<{ waiting: string }[]>`
    select count(*)::text as waiting from pg_locks where locktype = 'advisory' and not granted`;
  return Number(row?.waiting ?? 0);
}

describe("the lock of a credited voucher on a real Postgres", () => {
  it("is named for the voucher type, point of sale and number", () => {
    expect(creditedVoucherLockKey({ voucherType: 11, pointOfSale: 31, number: 42 })).toBe(
      "credited_voucher:11:31:42",
    );
  });

  it("makes a second credit of the same voucher wait until the first transaction ends, and leaves other vouchers alone", async () => {
    const voucher = { voucherType: 11, pointOfSale: 31, number: 900 };
    let releaseFirst: () => void = () => {};
    const firstHolds = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let firstLocked: () => void = () => {};
    const locked = new Promise<void>((resolve) => {
      firstLocked = resolve;
    });
    const first = db.transaction(async (tx) => {
      await lockCreditedVoucher(tx, voucher);
      firstLocked();
      await firstHolds;
    });
    await locked;
    let secondGotIt = false;
    const second = db.transaction(async (tx) => {
      await lockCreditedVoucher(tx, voucher);
      secondGotIt = true;
    });
    const other = db.transaction((tx) =>
      lockCreditedVoucher(tx, { ...voucher, number: voucher.number + 1 }),
    );

    await other;
    while ((await waitingAdvisoryLocks()) === 0) {
      await Promise.resolve();
    }
    expect(secondGotIt).toBe(false);
    releaseFirst();
    await first;
    await second;

    expect(secondGotIt).toBe(true);
  });
});

describe("crediting one voucher offline and online at the same time, on a real Postgres", () => {
  function onlineLane() {
    return new DrizzleSaleCreditNoteLanes(postgresDedicatedConnections(sql), async () => {});
  }

  it("never lets both credit it: the online request is refused exactly when the offline credit note found it free", async () => {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const voucher = { voucherType: 11, pointOfSale: 31, number: 1000 + attempt };
      const offlineDocumentId = randomUUID();
      const creditNoteId = randomUUID();

      const [offlineSawItCredited, onlineOutcome] = await Promise.all([
        db.transaction(async (tx) => {
          await lockCreditedVoucher(tx, voucher);
          const credited = await voucherCreditedOnline(tx, voucher);
          await tx.insert(offlineFiscalDocuments).values({
            id: offlineDocumentId,
            saleId: randomUUID(),
            registerId,
            pointOfSale: 8,
            documentType: "credit_note_c",
            number: attempt + 1,
            issuedOn: FORTNIGHT.start,
            generatedAt: RECEIVED_AT,
            generationStamp: "20261001100000",
            offlineAuthorizationCode: "36123456789012",
            fortnightStart: FORTNIGHT.start,
            fortnightEnd: FORTNIGHT.end,
            buyerDocumentType: 99,
            buyerDocumentNumber: 0,
            buyerTaxStatusCode: 5,
            total: 10_000,
            netAmount: 10_000,
            cause: "no_connectivity",
            recordedAt: RECEIVED_AT,
            creditNoteId: randomUUID(),
            correctedVoucherType: voucher.voucherType,
            correctedPointOfSale: voucher.pointOfSale,
            correctedNumber: voucher.number,
          });
          return credited;
        }),
        onlineLane()
          .inPointOfSaleLane(7, (lane) =>
            lane.recordSaleCreditNote({
              creditNoteId,
              registerId,
              saleId: randomUUID(),
              pointOfSale: 7,
              correctedVoucher: voucher,
              total: 10_000,
              receiverTaxStatusCode: 5,
              receivedAt: RECEIVED_AT,
            }),
          )
          .then(
            () => "recorded" as const,
            (error: unknown) => (error instanceof VoucherAlreadyCredited ? "refused" : error),
          ),
      ]);

      const recordedOnline =
        (await db.select().from(creditNotes).where(eq(creditNotes.id, creditNoteId))).length === 1;
      expect(onlineOutcome).toBe(recordedOnline ? "recorded" : "refused");
      expect(offlineSawItCredited).toBe(recordedOnline);
    }
  });
});
