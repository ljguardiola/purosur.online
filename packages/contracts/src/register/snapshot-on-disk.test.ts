import { describe, expect, it } from "vitest";
import { snapshotsOnDiskBodySchema } from "./snapshot-on-disk.js";

const ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const OTHER_ID = "6c1d3e84-0a52-4b0e-8a9f-1d2e3f4a5b6c";

describe("snapshotsOnDiskBodySchema", () => {
  it("reads the ids of the generations a register holds on its disk", () => {
    const body = { generation_ids: [ID, OTHER_ID] };
    expect(snapshotsOnDiskBodySchema.parse(body)).toEqual(body);
  });

  it("reads a register that holds none", () => {
    expect(snapshotsOnDiskBodySchema.parse({ generation_ids: [] })).toEqual({
      generation_ids: [],
    });
  });

  it.each([
    ["no ids", {}],
    ["an id that is not a uuid", { generation_ids: ["g1"] }],
    ["ids that are not a list", { generation_ids: ID }],
    ["a field it does not know", { generation_ids: [], extra: 1 }],
  ])("refuses a body with %s", (_name, body) => {
    expect(snapshotsOnDiskBodySchema.safeParse(body).success).toBe(false);
  });
});
