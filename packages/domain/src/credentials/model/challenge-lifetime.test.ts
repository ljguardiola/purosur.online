import { describe, expect, it } from "vitest";
import {
  CHALLENGE_TTL_MS,
  challengeExpiryWindowStart,
  isChallengeLive,
} from "./challenge-lifetime.js";

const NOW = new Date("2026-10-01T12:00:00.000Z");

describe("challenge lifetime", () => {
  it("lasts 5 minutes", () => {
    expect(CHALLENGE_TTL_MS).toBe(5 * 60 * 1000);
  });
});

describe("isChallengeLive", () => {
  it("is live one millisecond before it expires", () => {
    expect(isChallengeLive(new Date(NOW.getTime() - CHALLENGE_TTL_MS + 1), NOW)).toBe(true);
  });

  it("is expired exactly when its lifetime is over", () => {
    expect(isChallengeLive(new Date(NOW.getTime() - CHALLENGE_TTL_MS), NOW)).toBe(false);
  });

  it("is live right after it was issued", () => {
    expect(isChallengeLive(NOW, NOW)).toBe(true);
  });
});

describe("challengeExpiryWindowStart", () => {
  it("is one lifetime before now", () => {
    expect(challengeExpiryWindowStart(NOW)).toEqual(new Date("2026-10-01T11:55:00.000Z"));
  });
});
