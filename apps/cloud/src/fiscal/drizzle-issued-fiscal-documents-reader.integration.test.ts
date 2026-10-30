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
import { DrizzleIssuedFiscalDocumentsReader } from "./drizzle-issued-fiscal-documents-reader.js";
import {
  insertCaeaDocument,
  insertOnlineCreditNote,
  insertReceiptRequest,
} from "./test-support/issued-document-fixtures.js";

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;
let reader: DrizzleIssuedFiscalDocumentsReader<PostgresJsQueryResultHKT>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("issued_fiscal_documents_reader");
  sql = postgres(integrationDb.databaseUrl, { max: 2 });
  db = drizzle(sql);
  reader = new DrizzleIssuedFiscalDocumentsReader(db);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

describe("DrizzleIssuedFiscalDocumentsReader.issuedInPeriod on the deployed driver", () => {
  it("answers the total of every kind of issued document as a number", async () => {
    const { registerId, locationId } = await insertEnrolledInstallation(db, {
      now: new Date("2026-10-07T15:00:00.000Z"),
      registerName: "Caja 1",
    });
    await insertReceiptRequest(db, registerId, { total: 4_800 });
    await insertOnlineCreditNote(db, registerId, { total: 1_200 });
    await insertCaeaDocument(db, registerId, { total: 3_000 });

    const { documents } = await reader.issuedInPeriod({
      locationId,
      range: { from: "2026-10-01", to: "2026-10-31" },
      registerId: undefined,
      kind: undefined,
      number: undefined,
      page: { number: 1, size: 50 },
    });

    expect(documents.map(({ total }) => total).sort((a, b) => a - b)).toEqual([
      1_200, 3_000, 4_800,
    ]);
  });
});
