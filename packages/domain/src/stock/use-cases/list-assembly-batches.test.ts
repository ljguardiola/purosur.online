import { describe, expect, it } from "vitest";
import type { AssemblyBatchListing } from "./assembly-batch-list-reader.js";
import { listAssemblyBatches } from "./list-assembly-batches.js";
import { FakeAssemblyBatchListReader } from "./test-support/fake-assembly-batch-list-reader.js";

function batch(id: string, assembledAt: string): AssemblyBatchListing {
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
    lines: [{ componentProductId: "nuts", name: "Nueces", saleUnit: "KG", quantity: 12_000 }],
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
