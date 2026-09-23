import { describe, expect, it } from "vitest";
import { edgeOriginSecretMatches } from "./edge-origin-guard.js";

describe("edgeOriginSecretMatches", () => {
  it("returns true when the received value equals the expected secret", () => {
    expect(edgeOriginSecretMatches("correct-secret", "correct-secret")).toBe(true);
  });

  it("returns false when no value was received", () => {
    expect(edgeOriginSecretMatches("correct-secret", undefined)).toBe(false);
  });

  it("returns false when the received value differs but has the same length", () => {
    expect(edgeOriginSecretMatches("correct-secret", "wrong-secret!!")).toBe(false);
  });

  it("returns false when the received value is shorter than the expected secret", () => {
    expect(edgeOriginSecretMatches("correct-secret", "short")).toBe(false);
  });

  it("returns false when the received value is longer than the expected secret", () => {
    expect(edgeOriginSecretMatches("correct-secret", "correct-secret-plus-extra")).toBe(false);
  });

  it("returns false for an empty received value against a non-empty secret", () => {
    expect(edgeOriginSecretMatches("correct-secret", "")).toBe(false);
  });
});
