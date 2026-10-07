import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  MINIMUM_ACCEPTED_REGISTER_VERSION,
  registerVersionAccepted,
  versionAtLeast,
} from "./register-version.js";

const part = fc.nat({ max: 5000 });

describe("registerVersionAccepted", () => {
  it("accepts the version every register reports before any release exists", () => {
    expect(MINIMUM_ACCEPTED_REGISTER_VERSION).toBe("0.0.0");
    expect(registerVersionAccepted("0.0.0")).toBe(true);
  });

  it.each(["1.4.0", "10.20.30", "0.0.1"])("accepts %s", (version) => {
    expect(registerVersionAccepted(version)).toBe(true);
  });

  it.each([
    "",
    "1",
    "1.4",
    "1.4.0.1",
    "v1.4.0",
    "1.4.0-beta",
    "1.4.0+build",
    "1.4.x",
    "-1.4.0",
    "1.-4.0",
    "1.4.0 ",
    " 1.4.0",
    "01.4.0",
    "1.04.0",
    "1.4.00",
    "1..0",
    "a.b.c",
    "1.4.0\n",
  ])("does not accept %j", (version) => {
    expect(registerVersionAccepted(version)).toBe(false);
  });
});

describe("versionAtLeast", () => {
  it("compares the parts numerically, not as text", () => {
    expect(versionAtLeast("10.0.0", "9.0.0")).toBe(true);
    expect(versionAtLeast("9.0.0", "10.0.0")).toBe(false);
    expect(versionAtLeast("1.10.0", "1.9.0")).toBe(true);
    expect(versionAtLeast("1.0.10", "1.0.9")).toBe(true);
  });

  it("is true for the same version", () => {
    expect(versionAtLeast("2.3.4", "2.3.4")).toBe(true);
  });

  it("lets a greater major win over smaller minor and patch", () => {
    expect(versionAtLeast("2.0.0", "1.99.99")).toBe(true);
    expect(versionAtLeast("1.99.99", "2.0.0")).toBe(false);
  });

  it("lets a greater minor win over a smaller patch", () => {
    expect(versionAtLeast("1.2.0", "1.1.99")).toBe(true);
    expect(versionAtLeast("1.1.99", "1.2.0")).toBe(false);
  });

  it("is not true for a version that is not of the form X.Y.Z", () => {
    expect(versionAtLeast("2.0", "1.0.0")).toBe(false);
    expect(versionAtLeast("2.0.0", "1.0")).toBe(false);
  });

  it("agrees with comparing the three parts in order, for any pair", () => {
    fc.assert(
      fc.property(fc.tuple(part, part, part), fc.tuple(part, part, part), (a, b) => {
        const expected = a[0] !== b[0] ? a[0] > b[0] : a[1] !== b[1] ? a[1] > b[1] : a[2] >= b[2];

        expect(versionAtLeast(a.join("."), b.join("."))).toBe(expected);
      }),
    );
  });

  it("holds when the numbers are beyond what a double keeps apart", () => {
    expect(versionAtLeast("1.0.9007199254740993", "1.0.9007199254740992")).toBe(true);
    expect(versionAtLeast("1.0.9007199254740992", "1.0.9007199254740993")).toBe(false);
  });
});
