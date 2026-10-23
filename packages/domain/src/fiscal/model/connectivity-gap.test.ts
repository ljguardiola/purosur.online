import { describe, expect, it } from "vitest";
import { isConnectivityGap } from "./connectivity-gap.js";

describe("isConnectivityGap", () => {
  it("is not a gap while the register authorizes in real time", () => {
    expect(isConnectivityGap({ kind: "real_time" })).toBe(false);
  });

  it("is a gap while the register issues documents with an offline code", () => {
    expect(isConnectivityGap({ kind: "offline_code", cause: "no_connectivity" })).toBe(true);
  });

  it("is a gap while the register defers its sales", () => {
    expect(isConnectivityGap({ kind: "deferring", reason: "deferred_backlog" })).toBe(true);
  });
});
