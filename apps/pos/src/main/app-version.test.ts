import { describe, expect, it } from "vitest";
import { appVersionOf } from "./app-version";

function partsOf(version: string): number[] {
  return version.split(".").map(Number);
}

describe("the version the register states", () => {
  it("is an installed register's own version, exactly", () => {
    expect(appVersionOf({ isPackaged: true, version: "1.0.1385" })).toBe("1.0.1385");
    expect(appVersionOf({ isPackaged: true, version: "1.0.0" })).toBe("1.0.0");
  });

  it("is, for a run from source, later than every release of the same major and minor", () => {
    expect(partsOf(appVersionOf({ isPackaged: false, version: "1.0.0" }))).toEqual([
      1,
      0,
      Number.MAX_SAFE_INTEGER,
    ]);
  });

  it("keeps the major and minor of the source it runs from", () => {
    expect(partsOf(appVersionOf({ isPackaged: false, version: "2.3.0" })).slice(0, 2)).toEqual([
      2, 3,
    ]);
  });
});
