import { FACTURA_C_VOUCHER_TYPE } from "@purosur/domain";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { creditNotesOfSale, otherDocumentsOfSale } from "./orphan-local-standing.js";
import { recordOrphanRegularization } from "./record-orphan-regularization.js";
import { insertRegisterWithPointOfSale } from "./test-support/authorization-request-fixtures.js";
import {
  insertOfflineCreditNote,
  insertOfflineFiscalDocument,
} from "./test-support/offline-fiscal-document-fixtures.js";
import {
  creditNoteRegularization,
  OPENED_AT,
} from "./test-support/orphan-regularization-fixtures.js";
import { insertSaleCreditNote } from "./test-support/sale-credit-notes.js";

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;
let registerId: string;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("orphan_local_standing");
  sql = postgres(integrationDb.databaseUrl, { max: 2 });
  db = drizzle(sql);
  registerId = await insertRegisterWithPointOfSale(db, { pointOfSaleNumber: 7, name: "caja-1" });
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

const voucherAt = (number: number) => ({
  voucherType: FACTURA_C_VOUCHER_TYPE,
  pointOfSale: 7,
  number,
});

function recordOrphanCreditNote(saleId: string, credited: number, kept: number) {
  return recordOrphanRegularization(
    db,
    creditNoteRegularization({
      saleId,
      associatedVoucher: voucherAt(credited),
      keptVoucher: voucherAt(kept),
    }),
    { at: OPENED_AT, enqueueCreditNote: async () => {} },
  );
}

describe("the credit notes of a sale on a real Postgres", () => {
  it("gives each credit note of the sale with the voucher it credited and the one it kept", async () => {
    const saleId = crypto.randomUUID();
    await recordOrphanCreditNote(saleId, 101, 102);
    await recordOrphanCreditNote(crypto.randomUUID(), 103, 104);

    expect(await creditNotesOfSale(db, saleId)).toEqual([
      { creditedVoucher: voucherAt(101), keptVoucher: voucherAt(102) },
    ]);
  });

  it("gives a credit note that kept no voucher with none kept, after the earlier ones", async () => {
    const saleId = crypto.randomUUID();
    await insertSaleCreditNote(db, registerId, saleId, {
      associatedPointOfSale: 7,
      associatedNumber: 105,
    });
    await recordOrphanCreditNote(saleId, 106, 107);

    expect(await creditNotesOfSale(db, saleId)).toEqual([
      { creditedVoucher: voucherAt(106), keptVoucher: voucherAt(107) },
      { creditedVoucher: voucherAt(105), keptVoucher: null },
    ]);
  });

  it("gives none for a sale without credit notes", async () => {
    expect(await creditNotesOfSale(db, crypto.randomUUID())).toEqual([]);
  });
});

describe("the other documents of a sale on a real Postgres", () => {
  const FORTNIGHT = { start: "2026-10-01", end: "2026-10-15" };

  it("gives the factura issued offline for the sale and not its offline credit note", async () => {
    const saleId = crypto.randomUUID();
    await insertOfflineFiscalDocument(db, {
      registerId,
      pointOfSale: 7,
      fortnight: FORTNIGHT,
      number: 21,
      saleId,
    });
    await insertOfflineCreditNote(db, {
      registerId,
      pointOfSale: 7,
      fortnight: FORTNIGHT,
      number: 4,
      corrects: voucherAt(21),
      saleId,
    });

    expect(await otherDocumentsOfSale(db, saleId, crypto.randomUUID())).toEqual([
      { kind: "offline", voucher: voucherAt(21) },
    ]);
  });

  it("gives none for a sale whose only offline document is a credit note", async () => {
    const saleId = crypto.randomUUID();
    await insertOfflineCreditNote(db, {
      registerId,
      pointOfSale: 7,
      fortnight: FORTNIGHT,
      number: 5,
      corrects: voucherAt(22),
      saleId,
    });

    expect(await otherDocumentsOfSale(db, saleId, crypto.randomUUID())).toEqual([]);
  });
});
