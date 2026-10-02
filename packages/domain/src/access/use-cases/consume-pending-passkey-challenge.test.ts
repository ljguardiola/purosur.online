import { describe, expect, it } from "vitest";
import { CHALLENGE_TTL_MS } from "../model/challenge-lifetime.js";
import { consumePendingPasskeyChallenge } from "./consume-pending-passkey-challenge.js";
import { FakePendingPasskeyChallengeStore } from "./test-support/fake-pending-passkey-challenge-store.js";

const ISSUED_AT = new Date("2026-10-01T12:00:00.000Z");
const INPUT = { sessionId: "s-1", kind: "registration", at: ISSUED_AT } as const;

function setup() {
  const store = new FakePendingPasskeyChallengeStore();
  store.held.push(
    { sessionId: "s-1", kind: "registration", challenge: "challenge-1", issuedAt: ISSUED_AT },
    { sessionId: "s-1", kind: "session_authorization", challenge: "other", issuedAt: ISSUED_AT },
    { sessionId: "s-2", kind: "registration", challenge: "another", issuedAt: ISSUED_AT },
  );
  return { store };
}

describe("consumePendingPasskeyChallenge", () => {
  it("hands over the live challenge of the session and kind, and nothing else", async () => {
    const ports = setup();

    const outcome = await consumePendingPasskeyChallenge(ports, INPUT);

    expect(outcome).toEqual({ kind: "consumed", challenge: "challenge-1" });
    expect(ports.store.held.map((held) => held.challenge)).toEqual(["other", "another"]);
  });

  it("hands over the challenge up to one millisecond before it expires", async () => {
    const ports = setup();

    const outcome = await consumePendingPasskeyChallenge(ports, {
      ...INPUT,
      at: new Date(ISSUED_AT.getTime() + CHALLENGE_TTL_MS - 1),
    });

    expect(outcome).toEqual({ kind: "consumed", challenge: "challenge-1" });
  });

  it("refuses the challenge exactly when its lifetime is over, and spends it", async () => {
    const ports = setup();

    const outcome = await consumePendingPasskeyChallenge(ports, {
      ...INPUT,
      at: new Date(ISSUED_AT.getTime() + CHALLENGE_TTL_MS),
    });

    expect(outcome).toEqual({ kind: "not_pending" });
    expect(ports.store.held.map((held) => held.challenge)).toEqual(["other", "another"]);
  });

  it("refuses a session that holds no challenge of that kind", async () => {
    const ports = setup();

    const outcome = await consumePendingPasskeyChallenge(ports, { ...INPUT, sessionId: "s-3" });

    expect(outcome).toEqual({ kind: "not_pending" });
    expect(ports.store.held).toHaveLength(3);
  });

  it("hands a challenge over only once", async () => {
    const ports = setup();
    await consumePendingPasskeyChallenge(ports, INPUT);

    const outcome = await consumePendingPasskeyChallenge(ports, INPUT);

    expect(outcome).toEqual({ kind: "not_pending" });
  });

  it("takes the challenge in one transaction", async () => {
    const ports = setup();

    await consumePendingPasskeyChallenge(ports, INPUT);

    expect(ports.store.operationOrder).toEqual(["takeChallenge"]);
    expect(ports.store.transactions).toBe(1);
  });
});
