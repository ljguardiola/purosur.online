import { describe, expect, it } from "vitest";
import { CHALLENGE_TTL_MS } from "../model/challenge-lifetime.js";
import { issueSignInChallenge } from "./issue-sign-in-challenge.js";
import { FakeSignInChallenges } from "./test-support/fake-sign-in-challenges.js";

const AT = new Date("2026-10-01T12:00:00.000Z");

describe("issueSignInChallenge", () => {
  it("holds the challenge from the moment it was issued", async () => {
    const challenges = new FakeSignInChallenges();

    const outcome = await issueSignInChallenge(
      { challenges },
      { challenge: "challenge-1", at: AT },
    );

    expect(outcome).toEqual({ kind: "issued" });
    expect([...challenges.held]).toEqual([["challenge-1", AT]]);
  });

  it("discards the challenges issued a whole lifetime ago and keeps the ones still live", async () => {
    const challenges = new FakeSignInChallenges();
    challenges.held.set("expired", new Date(AT.getTime() - CHALLENGE_TTL_MS));
    challenges.held.set("live", new Date(AT.getTime() - CHALLENGE_TTL_MS + 1));

    await issueSignInChallenge({ challenges }, { challenge: "challenge-1", at: AT });

    expect([...challenges.held.keys()]).toEqual(["live", "challenge-1"]);
  });

  it("discards the expired challenges and stores the new one in one transaction", async () => {
    const challenges = new FakeSignInChallenges();

    await issueSignInChallenge({ challenges }, { challenge: "challenge-1", at: AT });

    expect(challenges.operationOrder).toEqual([
      "discardChallengesIssuedAtOrBefore",
      "storeChallenge",
    ]);
    expect(challenges.transactions).toBe(1);
  });

  it("keeps the expired challenges when storing the new one fails", async () => {
    const challenges = new FakeSignInChallenges();
    challenges.held.set("expired", new Date(AT.getTime() - CHALLENGE_TTL_MS));
    challenges.failingWrites.add("storeChallenge");

    await expect(
      issueSignInChallenge({ challenges }, { challenge: "challenge-1", at: AT }),
    ).rejects.toThrow("storeChallenge failed");

    expect([...challenges.held.keys()]).toEqual(["expired"]);
  });
});
