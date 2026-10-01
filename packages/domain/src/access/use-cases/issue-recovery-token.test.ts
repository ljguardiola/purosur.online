import { describe, expect, it } from "vitest";
import { RECOVERY_TOKEN_LIFETIME_MS } from "../model/recovery-token.js";
import { issueRecoveryToken } from "./issue-recovery-token.js";
import {
  type FakeRecoveryToken,
  FakeRecoveryTokenStore,
} from "./test-support/fake-recovery-token-store.js";

const REQUESTED_AT = new Date("2026-10-01T11:59:00.000Z");
const NOW = new Date("2026-10-01T12:00:00.000Z");

function storedToken(overrides: Partial<FakeRecoveryToken> & { id: string }): FakeRecoveryToken {
  return {
    userId: "u-1",
    tokenHash: `hash-${overrides.id}`,
    requestedAt: new Date("2026-10-01T10:00:00.000Z"),
    requestId: `request-${overrides.id}`,
    issuedAt: new Date("2026-10-01T10:00:01.000Z"),
    expiresAt: new Date("2026-10-01T10:15:01.000Z"),
    usedAt: null,
    voidedAt: null,
    ...overrides,
  };
}

function fixture(account: { active: boolean } = { active: true }) {
  const store = new FakeRecoveryTokenStore();
  store.seedAccount({ id: "u-1", email: "ada@example.test", ...account });
  const issue = (overrides: Partial<Parameters<typeof issueRecoveryToken>[1]> = {}) =>
    issueRecoveryToken(
      { store },
      {
        email: "ada@example.test",
        requestId: "request-new",
        requestedAt: REQUESTED_AT,
        now: NOW,
        tokenHash: "hash-new",
        ...overrides,
      },
    );
  return { store, issue };
}

describe("issueRecoveryToken", () => {
  it("issues a token for the account that expires after the recovery token lifetime", async () => {
    const { store, issue } = fixture();

    const outcome = await issue();

    expect(outcome).toEqual({ kind: "issued" });
    expect(store.snapshot().tokens).toEqual([
      {
        id: "token-1",
        userId: "u-1",
        tokenHash: "hash-new",
        requestedAt: REQUESTED_AT,
        requestId: "request-new",
        issuedAt: NOW,
        expiresAt: new Date(NOW.getTime() + RECOVERY_TOKEN_LIFETIME_MS),
        usedAt: null,
        voidedAt: null,
      },
    ]);
  });

  it("records the issued token when the request was made", async () => {
    const { store, issue } = fixture();

    await issue();

    expect(store.snapshot().issuedTokenRecords).toEqual([
      { userId: "u-1", tokenId: "token-1", requestedAt: REQUESTED_AT },
    ]);
  });

  it("opens the recovery-requested alert with the request and token times", async () => {
    const { store, issue } = fixture();

    await issue();

    expect(store.snapshot().alerts).toEqual([
      {
        userId: "u-1",
        requestedAt: REQUESTED_AT,
        issuedAt: NOW,
        expiresAt: new Date(NOW.getTime() + RECOVERY_TOKEN_LIFETIME_MS),
      },
    ]);
  });

  it("voids the outstanding tokens of the account at the moment of issuing", async () => {
    const { store, issue } = fixture();
    store.seedToken(storedToken({ id: "old" }));

    await issue();

    const [old] = store.snapshot().tokens;
    expect(old).toMatchObject({ id: "old", voidedAt: NOW });
  });

  it("leaves used and already voided tokens as they were", async () => {
    const { store, issue } = fixture();
    const usedAt = new Date("2026-10-01T10:05:00.000Z");
    const voidedAt = new Date("2026-10-01T10:06:00.000Z");
    store.seedToken(
      storedToken({ id: "used", usedAt, requestedAt: new Date("2026-10-01T09:00:00.000Z") }),
    );
    store.seedToken(
      storedToken({ id: "voided", voidedAt, requestedAt: new Date("2026-10-01T09:30:00.000Z") }),
    );

    await issue();

    const [used, voided] = store.snapshot().tokens;
    expect(used).toMatchObject({ usedAt, voidedAt: null });
    expect(voided).toMatchObject({ usedAt: null, voidedAt });
  });

  it("leaves the outstanding tokens of other accounts alone", async () => {
    const { store, issue } = fixture();
    store.seedToken(storedToken({ id: "other", userId: "u-2" }));

    await issue();

    expect(store.snapshot().tokens[0]).toMatchObject({ id: "other", voidedAt: null });
  });

  it("answers no account for an email nobody holds, and writes nothing", async () => {
    const { store, issue } = fixture();

    expect(await issue({ email: "nobody@example.test" })).toEqual({ kind: "no_account" });

    const after = store.snapshot();
    expect(after.tokens).toEqual([]);
    expect(after.rejectedRequests).toEqual([]);
    expect(after.alerts).toEqual([]);
  });

  it("rejects the request of an inactive account, recording it when it was made", async () => {
    const { store, issue } = fixture({ active: false });

    expect(await issue()).toEqual({ kind: "account_inactive" });

    const after = store.snapshot();
    expect(after.rejectedRequests).toEqual([
      { userId: "u-1", reason: "account_inactive", requestedAt: REQUESTED_AT },
    ]);
    expect(after.tokens).toEqual([]);
    expect(after.alerts).toEqual([]);
  });

  it("rejects a request that a newer one already superseded, and issues nothing", async () => {
    const { store, issue } = fixture();
    store.seedToken(
      storedToken({ id: "newer", requestedAt: new Date(REQUESTED_AT.getTime() + 1) }),
    );

    expect(await issue()).toEqual({ kind: "superseded" });

    const after = store.snapshot();
    expect(after.rejectedRequests).toEqual([
      { userId: "u-1", reason: "superseded", requestedAt: REQUESTED_AT },
    ]);
    expect(after.tokens).toHaveLength(1);
    expect(after.tokens[0]).toMatchObject({ id: "newer", voidedAt: null });
    expect(after.alerts).toEqual([]);
  });

  it("treats a token requested at the same moment by another request as superseding", async () => {
    const { store, issue } = fixture();
    store.seedToken(storedToken({ id: "same-moment", requestedAt: REQUESTED_AT }));

    expect(await issue()).toEqual({ kind: "superseded" });
  });

  it("is not superseded by an older request or by its own earlier token", async () => {
    const { store, issue } = fixture();
    store.seedToken(
      storedToken({ id: "older", requestedAt: new Date(REQUESTED_AT.getTime() - 1) }),
    );
    store.seedToken(
      storedToken({ id: "own", requestId: "request-new", requestedAt: REQUESTED_AT }),
    );

    expect(await issue()).toEqual({ kind: "issued" });
  });

  it("is not superseded by a newer token of another account", async () => {
    const { store, issue } = fixture();
    store.seedToken(storedToken({ id: "other", userId: "u-2", requestedAt: NOW }));

    expect(await issue()).toEqual({ kind: "issued" });
  });

  it("takes the account's recovery token lock before checking for a newer request and voiding", async () => {
    const { store, issue } = fixture();

    await issue();

    expect(store.operationOrder).toEqual([
      "findAccountByEmail",
      "lockRecoveryTokens:u-1",
      "hasNewerRequest",
      "voidOutstandingRecoveryTokens",
      "issueToken",
      "recordIssuedToken",
      "openRecoveryRequestedAlert",
    ]);
  });

  it("takes the lock before recording a superseded request", async () => {
    const { store, issue } = fixture();
    store.seedToken(storedToken({ id: "newer", requestedAt: NOW }));

    await issue();

    expect(store.operationOrder).toEqual([
      "findAccountByEmail",
      "lockRecoveryTokens:u-1",
      "hasNewerRequest",
      "recordRejectedRequest",
    ]);
  });

  it.each([
    "voidOutstandingRecoveryTokens",
    "issueToken",
    "recordIssuedToken",
    "openRecoveryRequestedAlert",
  ] as const)("leaves nothing behind when %s fails", async (operation) => {
    const { store, issue } = fixture();
    store.seedToken(storedToken({ id: "old" }));
    store.failingWrites.add(operation);
    const before = store.snapshot();

    await expect(issue()).rejects.toThrow(`${operation} failed`);

    expect(store.snapshot()).toEqual(before);
  });

  it("leaves nothing behind when recording a superseded request fails", async () => {
    const { store, issue } = fixture();
    store.seedToken(storedToken({ id: "newer", requestedAt: NOW }));
    store.failingWrites.add("recordRejectedRequest");
    const before = store.snapshot();

    await expect(issue()).rejects.toThrow("recordRejectedRequest failed");

    expect(store.snapshot()).toEqual(before);
  });
});
