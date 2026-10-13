import { assemblyBatches, assemblyBatchLines, lots } from "../../platform/db/schema.js";
import type { TestDatabase } from "../../test-support/build-test-database.js";

type Db = TestDatabase["db"];

export interface InsertedAssemblyBatch {
  batchId: string;
  lotId: string;
}

export async function insertAssemblyBatch(
  db: Db,
  batch: {
    productId: string;
    locationId: string;
    actorId: string;
    assembledAt: Date;
    output?: number;
    used?: { componentProductId: string; quantity: number }[];
    cost?: { totalCents: number; quantity: number } | null;
    costIncomplete?: boolean;
    expiresOn?: string | null;
  },
): Promise<InsertedAssemblyBatch> {
  const output = batch.output ?? 14_000;
  const [inserted] = await db
    .insert(assemblyBatches)
    .values({
      productId: batch.productId,
      locationId: batch.locationId,
      assembledAt: batch.assembledAt,
      outputQty: output,
      actorId: batch.actorId,
    })
    .returning({ id: assemblyBatches.id });
  if (!inserted) {
    throw new Error("test setup: seeding the batch returned no row");
  }
  if (batch.used?.length) {
    await db.insert(assemblyBatchLines).values(
      batch.used.map((use) => ({
        batchId: inserted.id,
        componentProductId: use.componentProductId,
        quantity: use.quantity,
      })),
    );
  }
  const cost = batch.cost === undefined ? { totalCents: 50_200, quantity: output } : batch.cost;
  const [lot] = await db
    .insert(lots)
    .values({
      productId: batch.productId,
      locationId: batch.locationId,
      assemblyBatchId: inserted.id,
      quantityReceived: output,
      remaining: output,
      costTotalCents: cost?.totalCents ?? null,
      costQuantity: cost?.quantity ?? null,
      costIncomplete: batch.costIncomplete ?? cost === null,
      expiresOn: batch.expiresOn ?? null,
    })
    .returning({ id: lots.id });
  if (!lot) {
    throw new Error("test setup: seeding the batch lot returned no row");
  }
  return { batchId: inserted.id, lotId: lot.id };
}
