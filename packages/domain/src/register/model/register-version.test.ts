import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { isNewerRegisterVersion, type RegisterVersion } from "./register-version.js";

const version = (major: number, minor: number, patch: number): RegisterVersion => ({
  major,
  minor,
  patch,
});

const anyVersion = fc.record({
  major: fc.nat({ max: 50 }),
  minor: fc.nat({ max: 50 }),
  patch: fc.nat({ max: 50 }),
});

function compareAsTuples(a: RegisterVersion, b: RegisterVersion): number {
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch;
}

describe("isNewerRegisterVersion", () => {
  it.each([
    [version(0, 0, 811), version(0, 0, 812)],
    [version(0, 0, 999), version(0, 1, 0)],
    [version(0, 99, 99), version(1, 0, 0)],
    [version(1, 2, 3), version(1, 2, 10)],
    [version(1, 9, 0), version(1, 10, 0)],
  ])("accepts %j to %j", (installed, offered) => {
    expect(isNewerRegisterVersion(installed, offered)).toBe(true);
  });

  it.each([
    [version(0, 0, 812), version(0, 0, 812)],
    [version(0, 0, 812), version(0, 0, 811)],
    [version(1, 0, 0), version(0, 99, 99)],
    [version(1, 10, 0), version(1, 9, 99)],
  ])("refuses %j to %j", (installed, offered) => {
    expect(isNewerRegisterVersion(installed, offered)).toBe(false);
  });

  it("never moves from a version to itself", () => {
    fc.assert(fc.property(anyVersion, (v) => !isNewerRegisterVersion(v, { ...v })));
  });

  it("never holds both ways", () => {
    fc.assert(
      fc.property(
        anyVersion,
        anyVersion,
        (a, b) => !(isNewerRegisterVersion(a, b) && isNewerRegisterVersion(b, a)),
      ),
    );
  });

  it("agrees with ordering the versions as number tuples", () => {
    fc.assert(
      fc.property(
        anyVersion,
        anyVersion,
        (a, b) => isNewerRegisterVersion(a, b) === compareAsTuples(a, b) < 0,
      ),
    );
  });
});
