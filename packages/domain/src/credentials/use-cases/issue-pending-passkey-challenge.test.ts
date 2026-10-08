import { describe, expect, it } from "vitest";
import { CHALLENGE_TTL_MS } from "../model/challenge-lifetime.js";
import { issuePendingPasskeyChallenge } from "./issue-pending-passkey-challenge.js";
import { FakePendingPasskeyChallengeStore } from "./test-support/fake-pending-passkey-challenge-store.js";

const AT = new Date("2026-10-01T12:00:00.000Z");
const INPUT = {
  sessionId: "s-1",
  kind: "registration",
  challenge: "challenge-1",
  at: AT,
} as const;

describe("issuePendingPasskeyChallenge", () => {
  it("holds the challenge for the session and kind from the moment it was issued", async () => {
    const store = new FakePendingPasskeyChallengeStore();

    const outcome = await issuePendingPasskeyChallenge({ store }, INPUT);

    expect(outcome).toEqual({ kind: "issued" });
    expect(store.held).toEqual([
      { sessionId: "s-1", kind: "registration", challenge: "challenge-1", issuedAt: AT },
    ]);
  });

  it("replaces the challenge the session already held for that kind", async () => {
    const store = new FakePendingPasskeyChallengeStore();
    await issuePendingPasskeyChallenge({ store }, { ...INPUT, challenge: "old" });

    await issuePendingPasskeyChallenge({ store }, INPUT);

    expect(store.held).toEqual([
      { sessionId: "s-1", kind: "registration", challenge: "challenge-1", issuedAt: AT },
    ]);
  });

  it("keeps the challenges of its other kind and of other sessions", async () => {
    const store = new FakePendingPasskeyChallengeStore();
    await issuePendingPasskeyChallenge({ store }, { ...INPUT, kind: "session_authorization" });
    await issuePendingPasskeyChallenge({ store }, { ...INPUT, sessionId: "s-2" });

    await issuePendingPasskeyChallenge({ store }, INPUT);

    expect(store.held.map((held) => `${held.sessionId}:${held.kind}`)).toEqual([
      "s-1:session_authorization",
      "s-2:registration",
      "s-1:registration",
    ]);
  });

  it("discards the challenges issued a whole lifetime ago and keeps the ones still live", async () => {
    const store = new FakePendingPasskeyChallengeStore();
    store.held.push(
      {
        sessionId: "s-2",
        kind: "registration",
        challenge: "expired",
        issuedAt: new Date(AT.getTime() - CHALLENGE_TTL_MS),
      },
      {
        sessionId: "s-3",
        kind: "registration",
        challenge: "live",
        issuedAt: new Date(AT.getTime() - CHALLENGE_TTL_MS + 1),
      },
    );

    await issuePendingPasskeyChallenge({ store }, INPUT);

    expect(store.held.map((held) => held.challenge)).toEqual(["live", "challenge-1"]);
  });

  it("discards the expired challenges and stores the new one in one transaction", async () => {
    const store = new FakePendingPasskeyChallengeStore();

    await issuePendingPasskeyChallenge({ store }, INPUT);

    expect(store.operationOrder).toEqual(["discardChallengesIssuedAtOrBefore", "storeChallenge"]);
    expect(store.transactions).toBe(1);
  });

  it("keeps the expired challenges when storing the new one fails", async () => {
    const store = new FakePendingPasskeyChallengeStore();
    store.held.push({
      sessionId: "s-2",
      kind: "registration",
      challenge: "expired",
      issuedAt: new Date(AT.getTime() - CHALLENGE_TTL_MS),
    });
    const before = structuredClone(store.held);
    store.failingWrites.add("storeChallenge");

    await expect(issuePendingPasskeyChallenge({ store }, INPUT)).rejects.toThrow(
      "storeChallenge failed",
    );

    expect(store.held).toEqual(before);
  });
});
