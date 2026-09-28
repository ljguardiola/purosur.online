import { describe, expect, it } from "vitest";
import { loadedVersionSchema } from "./loaded-version.js";

const MESSAGE = "version must be the positive integer it was loaded with";

describe("loadedVersionSchema", () => {
  it.each([1, 2, 41])("accepts the positive integer %s", (version) => {
    expect(loadedVersionSchema.safeParse(version).success).toBe(true);
  });

  it.each([0, -1, 1.5, "1", null, undefined])("refuses %s with the version message", (version) => {
    const result = loadedVersionSchema.safeParse(version);

    expect(result.success ? [] : result.error.issues.map((issue) => issue.message)).toEqual([
      MESSAGE,
    ]);
  });
});
