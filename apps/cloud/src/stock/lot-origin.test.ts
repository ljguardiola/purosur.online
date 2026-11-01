import { describe, expect, it } from "vitest";
import { lotOriginOf } from "./lot-origin.js";

describe("lotOriginOf", () => {
  it("names a technical lot technical, whatever else it references", () => {
    expect(
      lotOriginOf({ technical: true, assemblyBatchId: "batch-1", purchaseLineId: "line-1" }),
    ).toBe("technical");
  });

  it("names a lot made by an assembly batch after its batch", () => {
    expect(
      lotOriginOf({ technical: false, assemblyBatchId: "batch-1", purchaseLineId: "line-1" }),
    ).toBe("assembly_batch");
  });

  it("names a lot received on a purchase line a purchase", () => {
    expect(lotOriginOf({ technical: false, assemblyBatchId: null, purchaseLineId: "line-1" })).toBe(
      "purchase",
    );
  });

  it("names a lot with neither a batch nor a purchase line the initial count", () => {
    expect(lotOriginOf({ technical: false, assemblyBatchId: null, purchaseLineId: null })).toBe(
      "initial_count",
    );
  });
});
