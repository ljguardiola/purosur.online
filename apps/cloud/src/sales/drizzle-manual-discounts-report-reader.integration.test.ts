import { randomUUID } from "node:crypto";
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
import { waitForLockWaiters } from "../test-support/queued-behind-held-lock.js";
import { DrizzleManualDiscountsReportReader } from "./drizzle-manual-discounts-report-reader.js";
import { applyCompletedSale } from "./test-support/applied-sales.js";
import { aSoldLine, withManualAdjustment } from "./test-support/sold-lines.js";

// A second real-Postgres connection commits a void mid-read; PGlite's single connection can't
// produce that interleaving.
const COMPLETED = new Date("2026-10-06T14:00:00.000Z");
const VOIDED = new Date("2026-10-06T15:00:00.000Z");

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let adminSql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;
let reader: DrizzleManualDiscountsReportReader<PostgresJsQueryResultHKT>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("manual_discounts_report_read");
  sql = postgres(integrationDb.databaseUrl, { max: 4 });
  // Only the schema's owner may LOCK TABLE or rewrite an applied sale; the read itself still runs
  // as `cloud_app`.
  adminSql = postgres(integrationDb.adminDatabaseUrl, { max: 2 });
  db = drizzle(sql);
  reader = new DrizzleManualDiscountsReportReader(db);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await adminSql.end({ timeout: 1 });
  await integrationDb.close();
});

describe("reading the manual discounts while a sale is voided, on a real Postgres through postgres-js", () => {
  it("answers the discount on the total and the line discounts of the sale from the same moment", async () => {
    const { deviceId, locationId } = await insertEnrolledInstallation(db, { now: COMPLETED });
    const saleId = await applyCompletedSale(db, {
      deviceId,
      completedAt: COMPLETED,
      total: 1_000,
      overrides: {
        saleDiscount: {
          kind: "AMOUNT",
          amount: 100,
          reason: "Cliente frecuente",
          authorizedBy: null,
        },
        saleDiscountAmount: 100,
        lines: [
          withManualAdjustment(
            { ...aSoldLine(randomUUID(), "Yerba 1 kg", 2, 2_000), listUnitPrice: 1_000 },
            { kind: "AMOUNT", amount: 200, reason: "Envase dañado", authorizedBy: null },
          ),
        ],
      },
    });
    const query = {
      locationId,
      range: { from: "2026-10-01", to: "2026-10-31" },
      registerId: undefined,
    };

    const writer = await adminSql.reserve();
    let read: ReturnType<typeof reader.completedManualDiscounts> | undefined;
    try {
      await writer`begin`;
      await writer`lock table sale_lines in access exclusive mode`;
      read = reader.completedManualDiscounts(query);
      await waitForLockWaiters(adminSql, 1);
      await writer`update sales set state = 'VOIDED', voided_at = ${VOIDED} where id = ${saleId}`;
      await writer`commit`;
    } catch (error) {
      await writer`rollback`;
      throw error;
    } finally {
      writer.release();
    }

    const during = await read;
    expect(during?.saleDiscounts.map((discount) => discount.saleId)).toEqual([saleId]);
    expect(during?.lineDiscounts.map((discount) => discount.saleId)).toEqual([saleId]);
    expect(await reader.completedManualDiscounts(query)).toEqual({
      saleDiscounts: [],
      lineDiscounts: [],
    });
  });
});
