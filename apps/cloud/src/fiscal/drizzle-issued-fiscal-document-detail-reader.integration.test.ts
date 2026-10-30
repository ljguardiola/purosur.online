import {
  drizzle,
  type PostgresJsDatabase,
  type PostgresJsQueryResultHKT,
} from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { DrizzleIssuedFiscalDocumentDetailReader } from "./drizzle-issued-fiscal-document-detail-reader.js";
import {
  insertOnlineCreditNote,
  insertReceiptRequest,
} from "./test-support/issued-document-fixtures.js";

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;
let reader: DrizzleIssuedFiscalDocumentDetailReader<PostgresJsQueryResultHKT>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("issued_fiscal_document_detail_reader");
  sql = postgres(integrationDb.databaseUrl, { max: 2 });
  db = drizzle(sql);
  reader = new DrizzleIssuedFiscalDocumentDetailReader(db);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

describe("DrizzleIssuedFiscalDocumentDetailReader.issuedDocumentOfBranch on the deployed driver", () => {
  it("answers the total of the voucher and of the credit notes that correct it as numbers", async () => {
    const { registerId, locationId } = await insertEnrolledInstallation(db, {
      now: new Date("2026-10-07T15:00:00.000Z"),
      registerName: "Caja 1",
    });
    await insertReceiptRequest(db, registerId, { pointOfSale: 7, number: 12, total: 4_800 });
    await insertOnlineCreditNote(db, registerId, {
      associatedVoucherType: 11,
      associatedPointOfSale: 7,
      associatedNumber: 12,
      total: 1_200,
    });

    const detail = await reader.issuedDocumentOfBranch(locationId, {
      voucherType: 11,
      pointOfSale: 7,
      number: 12,
    });

    expect(detail?.total).toBe(4_800);
    expect(detail?.creditNotes.map(({ total }) => total)).toEqual([1_200]);
  });
});
