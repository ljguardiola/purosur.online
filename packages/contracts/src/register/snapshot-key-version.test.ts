import { describe, expect, it } from "vitest";
import { currentSnapshotKeyVersionAnswerSchema } from "./snapshot-key-version.js";

describe("currentSnapshotKeyVersionAnswerSchema", () => {
  it("reads the version of the key a register's next generations are encrypted with", () => {
    expect(currentSnapshotKeyVersionAnswerSchema.parse({ current_key_version: 3 })).toEqual({
      current_key_version: 3,
    });
  });

  it.each([
    ["no version", {}],
    ["a version of zero", { current_key_version: 0 }],
    ["a fractional version", { current_key_version: 1.5 }],
    ["a version that is not a number", { current_key_version: "3" }],
  ])("refuses an answer with %s", (_name, answer) => {
    expect(currentSnapshotKeyVersionAnswerSchema.safeParse(answer).success).toBe(false);
  });
});
