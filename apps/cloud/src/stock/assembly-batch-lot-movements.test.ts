import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { lotAllocations } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { batchLotMovements } from "./assembly-batch-lot-movements.js";
import {
  type InsertedAssemblyBatch,
  insertAssemblyBatch,
} from "./test-support/assembly-batch-fixtures.js";
import {
  insertMovement,
  insertProduct,
  signedInWith,
} from "./test-support/stock-route-fixtures.js";

const NOW = new Date("2026-09-16T15:00:00.000Z");

let testDatabase: TestDatabase;
let db: TestDatabase["db"];

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
});

async function seeded() {
  const { userId: actorId, locationId } = await signedInWith(db, [], NOW);
  const { productId: mix } = await insertProduct(db, {
    name: "Mix de frutos secos",
    saleUnit: "KG",
  });
  async function batch(at: string): Promise<InsertedAssemblyBatch> {
    return insertAssemblyBatch(db, {
      productId: mix,
      locationId,
      actorId,
      assembledAt: new Date(at),
    });
  }
  async function move(
    lotId: string,
    kind: "adjustment" | "loss" | "assembly_out" | "assembly_in",
    delta: number,
    assemblyBatchId?: string,
  ): Promise<void> {
    const movementId = await insertMovement(db, {
      productId: mix,
      locationId,
      actorId,
      kind,
      reason: kind === "loss" ? "spoiled" : kind === "adjustment" ? "found" : null,
      delta,
      occurredAt: new Date("2026-05-05T10:00:00.000Z"),
      ...(assemblyBatchId === undefined ? {} : { assemblyBatchId }),
    });
    await db.insert(lotAllocations).values({ movementId, lotId, quantity: delta });
  }
  return { batch, move };
}

describe("batchLotMovements", () => {
  it("answers, for each batch, the batch each movement that moved its lot belongs to", async () => {
    const { batch, move } = await seeded();
    const first = await batch("2026-05-04T13:00:00.000Z");
    const second = await batch("2026-05-06T13:00:00.000Z");
    await move(first.lotId, "assembly_in", 14_000, first.batchId);
    await move(first.lotId, "loss", -500);
    await move(first.lotId, "assembly_out", -2_000, second.batchId);

    const found = await batchLotMovements(db, [first.batchId, second.batchId]);

    expect(found.get(first.batchId)).toEqual(
      expect.arrayContaining([
        { assemblyBatchId: first.batchId },
        { assemblyBatchId: null },
        { assemblyBatchId: second.batchId },
      ]),
    );
    expect(found.get(first.batchId)).toHaveLength(3);
    expect(found.get(second.batchId) ?? []).toEqual([]);
  });

  it("answers each batch a movement belongs to once, however many movements of it moved the lot", async () => {
    const { batch, move } = await seeded();
    const only = await batch("2026-05-04T13:00:00.000Z");
    await move(only.lotId, "adjustment", -1_000);
    await move(only.lotId, "loss", -500);

    const found = await batchLotMovements(db, [only.batchId]);

    expect(found.get(only.batchId)).toEqual([{ assemblyBatchId: null }]);
  });

  it("answers only the batches it was asked for", async () => {
    const { batch, move } = await seeded();
    const asked = await batch("2026-05-04T13:00:00.000Z");
    const other = await batch("2026-05-06T13:00:00.000Z");
    await move(other.lotId, "loss", -500);

    const found = await batchLotMovements(db, [asked.batchId]);

    expect([...found.keys()]).not.toContain(other.batchId);
  });

  it("answers nothing when asked for no batch", async () => {
    const { batch, move } = await seeded();
    const moved = await batch("2026-05-04T13:00:00.000Z");
    await move(moved.lotId, "loss", -500);

    expect((await batchLotMovements(db, [])).size).toBe(0);
  });
});
