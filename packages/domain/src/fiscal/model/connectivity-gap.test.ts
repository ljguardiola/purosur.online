import { describe, expect, it } from "vitest";
import { CONTINGENCY_KINDS, contingencyOf, isConnectivityGap } from "./connectivity-gap.js";

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

describe("contingencyOf", () => {
  it("is no contingency while the register authorizes in real time", () => {
    expect(contingencyOf({ kind: "real_time" })).toBeNull();
  });

  it("is a contingency with a notice while the register issues documents with an offline code", () => {
    expect(contingencyOf({ kind: "offline_code", cause: "no_connectivity" })).toEqual({
      kind: "offline_code",
      notice: true,
    });
  });

  it("is a contingency with a notice while the register defers its sales for a backlog", () => {
    expect(contingencyOf({ kind: "deferring", reason: "deferred_backlog" })).toEqual({
      kind: "deferring",
      notice: true,
    });
  });

  it("is a contingency without a notice while the register defers its sales because the pre-emission gate failed", () => {
    expect(contingencyOf({ kind: "deferring", reason: "pre_emission_gate_failed" })).toEqual({
      kind: "deferring",
      notice: false,
    });
  });

  it("lists the kinds a contingency can have", () => {
    expect(CONTINGENCY_KINDS).toEqual(["offline_code", "deferring"]);
  });
});
