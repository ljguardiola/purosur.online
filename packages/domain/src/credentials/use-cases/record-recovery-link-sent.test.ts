import { describe, expect, it } from "vitest";
import { recordRecoveryLinkSent } from "./record-recovery-link-sent.js";
import {
  type FakeRecoveryToken,
  FakeRecoveryTokenStore,
} from "./test-support/fake-recovery-token-store.js";

const SENT_AT = new Date("2026-10-01T12:00:05.000Z");

function storedToken(id: string): FakeRecoveryToken {
  return {
    id,
    userId: "u-1",
    tokenHash: `hash-${id}`,
    requestedAt: new Date("2026-10-01T11:59:00.000Z"),
    requestId: `request-${id}`,
    issuedAt: new Date("2026-10-01T12:00:00.000Z"),
    expiresAt: new Date("2026-10-01T12:15:00.000Z"),
    usedAt: null,
    voidedAt: null,
    sentAt: null,
  };
}

describe("recordRecoveryLinkSent", () => {
  it("marks the token as sent at the given moment and leaves the others alone", async () => {
    const store = new FakeRecoveryTokenStore();
    store.seedToken(storedToken("token-1"));
    store.seedToken(storedToken("token-2"));

    const outcome = await recordRecoveryLinkSent(
      { store },
      { tokenId: "token-1", sentAt: SENT_AT },
    );

    expect(outcome).toEqual({ kind: "recorded" });
    const [first, second] = store.snapshot().tokens;
    expect(first).toMatchObject({ id: "token-1", sentAt: SENT_AT });
    expect(second).toMatchObject({ id: "token-2", sentAt: null });
  });

  it("does its storage work in one transaction", async () => {
    const store = new FakeRecoveryTokenStore();
    store.seedToken(storedToken("token-1"));

    await recordRecoveryLinkSent({ store }, { tokenId: "token-1", sentAt: SENT_AT });

    expect(store.transactionCount).toBe(1);
    expect(store.operationOrder).toEqual(["markRecoveryLinkSent"]);
  });

  it("leaves nothing behind when the write fails", async () => {
    const store = new FakeRecoveryTokenStore();
    store.seedToken(storedToken("token-1"));
    store.failingWrites.add("markRecoveryLinkSent");
    const before = store.snapshot();

    await expect(
      recordRecoveryLinkSent({ store }, { tokenId: "token-1", sentAt: SENT_AT }),
    ).rejects.toThrow("markRecoveryLinkSent failed");

    expect(store.snapshot()).toEqual(before);
  });
});
