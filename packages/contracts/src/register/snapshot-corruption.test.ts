import { describe, expect, it } from "vitest";
import { snapshotCorruptionBodySchema } from "./snapshot-corruption.js";

describe("snapshotCorruptionBodySchema", () => {
  it.each(["copy", "integrity_check", "foreign_key_check"])("reads the %s stage", (stage) => {
    expect(snapshotCorruptionBodySchema.parse({ stage })).toEqual({ stage });
  });

  it("refuses a stage it does not know", () => {
    expect(snapshotCorruptionBodySchema.safeParse({ stage: "upload" }).success).toBe(false);
  });

  it("requires the stage", () => {
    expect(snapshotCorruptionBodySchema.safeParse({}).success).toBe(false);
  });

  it("refuses a field it does not know", () => {
    expect(snapshotCorruptionBodySchema.safeParse({ stage: "copy", detail: "x" }).success).toBe(
      false,
    );
  });
});
