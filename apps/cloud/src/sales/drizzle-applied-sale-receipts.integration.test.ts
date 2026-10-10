import { eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sales } from "../platform/db/schema.js";
import type { AppliedOrigin } from "../register/drizzle-applied-cash-sessions.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { aSalePrintStateFact } from "../sync/test-support/synced-facts.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { recordAppliedPrintState } from "./drizzle-applied-sale-receipts.js";
import { applyCompletedSale } from "./test-support/applied-sales.js";

const COMPLETED = new Date("2026-10-06T11:20:00.000Z");
const ATTEMPTED = new Date("2026-10-06T11:21:00.000Z");
const PRINTED = new Date("2026-10-06T11:21:05.000Z");
const PERMISSION_DENIED = "42501";

let integrationDb: IntegrationDatabase;
let cloudApp: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;
let origin: AppliedOrigin;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("applied_sale_receipts");
  cloudApp = postgres(integrationDb.databaseUrl, { max: 1 });
  db = drizzle(cloudApp);
  const { deviceId, registerId, locationId } = await insertEnrolledInstallation(db, {
    now: COMPLETED,
  });
  origin = { deviceId, registerId, locationId };
}, 60_000);

afterAll(async () => {
  await cloudApp.end({ timeout: 1 });
  await integrationDb.close();
});

function appliedSale() {
  return applyCompletedSale(db, { deviceId: origin.deviceId, completedAt: COMPLETED, total: 4800 });
}

function recordPrintState(saleId: string, printAttemptedAt: Date, printedAt: Date | null) {
  return db.transaction((tx) =>
    recordAppliedPrintState(
      tx,
      origin,
      aSalePrintStateFact({ saleId, printAttemptedAt, printedAt }),
    ),
  );
}

describe("recording the print state of an applied sale as cloud_app", () => {
  it("keeps the attempt and then the printing of the receipt", async () => {
    const saleId = await appliedSale();

    await recordPrintState(saleId, ATTEMPTED, null);
    await recordPrintState(saleId, ATTEMPTED, PRINTED);

    const [row] = await db
      .select({ attempted: sales.printAttemptedAt, printed: sales.printedAt })
      .from(sales)
      .where(eq(sales.id, saleId));
    expect(row).toEqual({ attempted: ATTEMPTED, printed: PRINTED });
  });

  it("still cannot rewrite, delete or truncate the rest of an applied sale", async () => {
    const saleId = await appliedSale();

    await expect(cloudApp`update sales set total = 1 where id = ${saleId}`).rejects.toMatchObject({
      code: PERMISSION_DENIED,
    });
    await expect(
      cloudApp`update sales set completed_at = now() where id = ${saleId}`,
    ).rejects.toMatchObject({ code: PERMISSION_DENIED });
    await expect(cloudApp`delete from sales where id = ${saleId}`).rejects.toMatchObject({
      code: PERMISSION_DENIED,
    });
    await expect(cloudApp`truncate sales cascade`).rejects.toMatchObject({
      code: PERMISSION_DENIED,
    });
  });
});
