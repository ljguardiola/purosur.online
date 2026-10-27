import { describe, expect, it } from "vitest";
import type { ReadAssemblyBatch } from "./assembly-batch-list-reader.js";
import { listAssemblyBatches } from "./list-assembly-batches.js";
import { FakeAssemblyBatchListReader } from "./test-support/fake-assembly-batch-list-reader.js";

function batch(id: string, assembledAt: string): ReadAssemblyBatch {
  return {
    id,
    productId: "mix",
    productName: "Mix de frutos secos",
    saleUnit: "KG",
    assembledAt: new Date(assembledAt),
    output: 14_000,
    unitCostCents: 3_586,
    costIncomplete: false,
    expiresOn: null,
    voided: false,
    lotConsumed: false,
  };
}

const QUERY = {
  locationId: "branch-1",
  from: new Date("2026-05-01T00:00:00.000Z"),
  to: new Date("2026-06-01T00:00:00.000Z"),
};

describe("listAssemblyBatches", () => {
  it("asks the reader for the location's batches of the period", async () => {
    const reader = new FakeAssemblyBatchListReader();

    await listAssemblyBatches(reader, QUERY);

    expect(reader.queries).toEqual([QUERY]);
  });

  it("answers the newest batch first", async () => {
    const reader = new FakeAssemblyBatchListReader([
      batch("middle", "2026-05-10T10:00:00.000Z"),
      batch("newest", "2026-05-20T10:00:00.000Z"),
      batch("oldest", "2026-05-02T10:00:00.000Z"),
    ]);

    const listed = await listAssemblyBatches(reader, QUERY);

    expect(listed.map((item) => item.id)).toEqual(["newest", "middle", "oldest"]);
  });

  it("orders batches of the same moment by their id, the greater first", async () => {
    const reader = new FakeAssemblyBatchListReader([
      batch("a", "2026-05-10T10:00:00.000Z"),
      batch("b", "2026-05-10T10:00:00.000Z"),
    ]);

    const listed = await listAssemblyBatches(reader, QUERY);

    expect(listed.map((item) => item.id)).toEqual(["b", "a"]);
  });
});

describe("listAssemblyBatches status", () => {
  it.each([
    { voided: false, lotConsumed: false, status: "voidable" },
    { voided: false, lotConsumed: true, status: "consumed" },
    { voided: true, lotConsumed: false, status: "voided" },
    { voided: true, lotConsumed: true, status: "voided" },
  ] as const)(
    "answers a batch voided $voided with its lot consumed $lotConsumed as $status",
    async ({ voided, lotConsumed, status }) => {
      const reader = new FakeAssemblyBatchListReader([
        { ...batch("one", "2026-05-10T10:00:00.000Z"), voided, lotConsumed },
      ]);

      const [listed] = await listAssemblyBatches(reader, QUERY);

      expect(listed?.status).toBe(status);
      expect(listed).not.toHaveProperty("voided");
      expect(listed).not.toHaveProperty("lotConsumed");
    },
  );
});
