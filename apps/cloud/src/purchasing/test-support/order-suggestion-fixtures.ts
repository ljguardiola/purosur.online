import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { insertEnrolledInstallation } from "../../installation/test-support/enrolled-installation.js";
import { products, registers, stockBalances } from "../../platform/db/schema.js";
import { applyCompletedSale } from "../../sales/test-support/applied-sales.js";
import { aSoldLine } from "../../sales/test-support/sold-lines.js";

type Db = PgDatabase<PgQueryResultHKT>;

export async function setCoverageDays(db: Db, productId: string, days: number): Promise<void> {
  await db.update(products).set({ coverageDays: days }).where(eq(products.id, productId));
}

export async function setStock(
  db: Db,
  input: { productId: string; locationId: string; quantity: number },
): Promise<void> {
  await db
    .insert(stockBalances)
    .values(input)
    .onConflictDoUpdate({
      target: [stockBalances.productId, stockBalances.locationId],
      set: { quantity: input.quantity },
    });
}

export async function insertRegisterDeviceIn(
  db: Db,
  locationId: string,
  now: Date,
): Promise<string> {
  const [register] = await db
    .insert(registers)
    .values({ locationId, name: `Caja ${crypto.randomUUID()}` })
    .returning({ id: registers.id });
  if (!register) {
    throw new Error("test setup: seeding the register returned no row");
  }
  const { deviceId } = await insertEnrolledInstallation(db, {
    now,
    existingRegisterId: register.id,
  });
  return deviceId;
}

export async function completeSale(
  db: Db,
  input: {
    deviceId: string;
    productId: string;
    quantity: number;
    completedAt: Date;
    weightSource?: "SCALE" | "MANUAL" | null;
  },
): Promise<void> {
  const line = aSoldLine(input.productId, "Producto", input.quantity, 1_000, input.weightSource);
  await applyCompletedSale(db, {
    deviceId: input.deviceId,
    completedAt: input.completedAt,
    total: line.lineTotal,
    overrides: { lines: [line] },
  });
}
