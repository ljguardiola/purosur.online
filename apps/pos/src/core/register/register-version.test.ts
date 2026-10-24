import { describe, expect, it } from "vitest";
import { registerVersionOf } from "./register-version";

describe("registerVersionOf", () => {
  it("reads a version written as major, minor and patch", () => {
    expect(registerVersionOf("1.10.3")).toEqual({ major: 1, minor: 10, patch: 3 });
  });

  it.each([undefined, null, "", "1.4", "v1.4.0", "garbled"])("knows no version from %j", (text) => {
    expect(registerVersionOf(text)).toBeNull();
  });
});
