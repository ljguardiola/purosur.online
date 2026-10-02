import { describe, expect, it } from "vitest";
import { CHALLENGE_TTL_MS } from "../model/challenge-lifetime.js";
import { consumeSignInChallenge } from "./consume-sign-in-challenge.js";
import { FakeSignInChallenges } from "./test-support/fake-sign-in-challenges.js";

const ISSUED_AT = new Date("2026-10-01T12:00:00.000Z");

function setup() {
  const challenges = new FakeSignInChallenges();
  challenges.held.set("challenge-1", ISSUED_AT);
  return { challenges };
}

describe("consumeSignInChallenge", () => {
  it("redeems a challenge that is still live", async () => {
    const ports = setup();

    const outcome = await consumeSignInChallenge(ports, {
      challenge: "challenge-1",
      at: ISSUED_AT,
    });

    expect(outcome).toEqual({ kind: "redeemed" });
  });

  it("redeems it up to one millisecond before it expires", async () => {
    const ports = setup();

    const outcome = await consumeSignInChallenge(ports, {
      challenge: "challenge-1",
      at: new Date(ISSUED_AT.getTime() + CHALLENGE_TTL_MS - 1),
    });

    expect(outcome).toEqual({ kind: "redeemed" });
  });

  it("refuses a challenge exactly when its lifetime is over, and spends it", async () => {
    const ports = setup();

    const outcome = await consumeSignInChallenge(ports, {
      challenge: "challenge-1",
      at: new Date(ISSUED_AT.getTime() + CHALLENGE_TTL_MS),
    });

    expect(outcome).toEqual({ kind: "refused" });
    expect(ports.challenges.held.size).toBe(0);
  });

  it("refuses a challenge that was never issued", async () => {
    const ports = setup();

    const outcome = await consumeSignInChallenge(ports, { challenge: "other", at: ISSUED_AT });

    expect(outcome).toEqual({ kind: "refused" });
    expect(ports.challenges.held.size).toBe(1);
  });

  it("redeems a challenge only once", async () => {
    const ports = setup();
    await consumeSignInChallenge(ports, { challenge: "challenge-1", at: ISSUED_AT });

    const outcome = await consumeSignInChallenge(ports, {
      challenge: "challenge-1",
      at: ISSUED_AT,
    });

    expect(outcome).toEqual({ kind: "refused" });
  });
});
