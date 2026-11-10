import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  isNewerRegisterVersion,
  isRegisterVersionAtLeast,
  isWellFormedRegisterVersion,
  type RegisterVersion,
} from "./register-version.js";

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

const textPart = fc.nat({ max: 5000 });

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

describe("isRegisterVersionAtLeast", () => {
  it("compares the parts numerically, not as text", () => {
    expect(isRegisterVersionAtLeast("10.0.0", "9.0.0")).toBe(true);
    expect(isRegisterVersionAtLeast("9.0.0", "10.0.0")).toBe(false);
    expect(isRegisterVersionAtLeast("1.10.0", "1.9.0")).toBe(true);
    expect(isRegisterVersionAtLeast("1.0.10", "1.0.9")).toBe(true);
  });

  it("is true for the same version", () => {
    expect(isRegisterVersionAtLeast("2.3.4", "2.3.4")).toBe(true);
  });

  it("lets a greater major win over smaller minor and patch", () => {
    expect(isRegisterVersionAtLeast("2.0.0", "1.99.99")).toBe(true);
    expect(isRegisterVersionAtLeast("1.99.99", "2.0.0")).toBe(false);
  });

  it("lets a greater minor win over a smaller patch", () => {
    expect(isRegisterVersionAtLeast("1.2.0", "1.1.99")).toBe(true);
    expect(isRegisterVersionAtLeast("1.1.99", "1.2.0")).toBe(false);
  });

  it("is not true for a version that is not of the form X.Y.Z", () => {
    expect(isRegisterVersionAtLeast("2.0", "1.0.0")).toBe(false);
    expect(isRegisterVersionAtLeast("2.0.0", "1.0")).toBe(false);
  });

  it("agrees with comparing the three parts in order, for any pair", () => {
    fc.assert(
      fc.property(
        fc.tuple(textPart, textPart, textPart),
        fc.tuple(textPart, textPart, textPart),
        (a, b) => {
          const expected = a[0] !== b[0] ? a[0] > b[0] : a[1] !== b[1] ? a[1] > b[1] : a[2] >= b[2];

          expect(isRegisterVersionAtLeast(a.join("."), b.join("."))).toBe(expected);
        },
      ),
    );
  });

  it("holds when the numbers are beyond what a double keeps apart", () => {
    expect(isRegisterVersionAtLeast("1.0.9007199254740993", "1.0.9007199254740992")).toBe(true);
    expect(isRegisterVersionAtLeast("1.0.9007199254740992", "1.0.9007199254740993")).toBe(false);
  });
});

describe("isWellFormedRegisterVersion", () => {
  it.each(["0.0.0", "1.4.0", "10.20.30"])("accepts %s", (version) => {
    expect(isWellFormedRegisterVersion(version)).toBe(true);
  });

  it.each(["", "1.4", "v1.4.0", "1.4.0-beta", "01.4.0", "1.4.0\n", " 1.4.0"])(
    "does not accept %j",
    (version) => {
      expect(isWellFormedRegisterVersion(version)).toBe(false);
    },
  );
});
