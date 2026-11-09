import { describe, expect, it } from "vitest";
import {
  isLeftBehindByMinimum,
  MINIMUM_ACCEPTED_REGISTER_VERSION,
  registerVersionAccepted,
} from "./register-version.js";

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

describe("isLeftBehindByMinimum", () => {
  it("leaves behind an installation that never reported a version", () => {
    expect(isLeftBehindByMinimum(null, "0.0.0")).toBe(true);
  });

  it("leaves behind a version older than the minimum", () => {
    expect(isLeftBehindByMinimum("1.3.9", "1.4.0")).toBe(true);
    expect(isLeftBehindByMinimum("1.9.0", "1.10.0")).toBe(true);
  });

  it("does not leave behind the minimum itself or a newer version", () => {
    expect(isLeftBehindByMinimum("1.4.0", "1.4.0")).toBe(false);
    expect(isLeftBehindByMinimum("2.0.0", "1.4.0")).toBe(false);
  });

  it("leaves behind a reported version that is not of the form X.Y.Z", () => {
    expect(isLeftBehindByMinimum("garbage", "0.0.0")).toBe(true);
  });
});
