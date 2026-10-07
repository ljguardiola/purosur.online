import { renewWsaaToken, type WsaaToken } from "@purosur/domain/fiscal/use-cases";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleWsaaTokenStore } from "./drizzle-wsaa-token-store.js";

const NOW = new Date("2026-10-01T12:00:00.000Z");
const HOUR_MS = 60 * 60 * 1000;
const SERVICE = "wsfe";
const FINGERPRINT = "AB:CD:EF";

const ISSUED: WsaaToken = {
  token: "FICTIONAL-TOKEN-0001",
  sign: "FICTIONAL-SIGN-0001",
  issuedAt: NOW,
  expiresAt: new Date(NOW.getTime() + 12 * HOUR_MS),
};

let testDatabase: TestDatabase;

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
});

function newStore() {
  return new DrizzleWsaaTokenStore(testDatabase.db);
}

describe("DrizzleWsaaTokenStore", () => {
  it("finds no token before one is recorded", async () => {
    expect(await newStore().transaction((tx) => tx.lockWsaaToken(SERVICE, FINGERPRINT))).toBeNull();
  });

  it("finds the recorded token, with its times, by service and certificate", async () => {
    await newStore().transaction((tx) => tx.recordWsaaToken(SERVICE, FINGERPRINT, ISSUED));

    expect(await newStore().transaction((tx) => tx.lockWsaaToken(SERVICE, FINGERPRINT))).toEqual(
      ISSUED,
    );
  });

  it("replaces the token of the same service and certificate", async () => {
    const newer = { ...ISSUED, token: "FICTIONAL-TOKEN-0002", sign: "FICTIONAL-SIGN-0002" };
    await newStore().transaction((tx) => tx.recordWsaaToken(SERVICE, FINGERPRINT, ISSUED));
    await newStore().transaction((tx) => tx.recordWsaaToken(SERVICE, FINGERPRINT, newer));

    expect(await newStore().transaction((tx) => tx.lockWsaaToken(SERVICE, FINGERPRINT))).toEqual(
      newer,
    );
  });

  it("keeps a token for each certificate and each service", async () => {
    const other = { ...ISSUED, token: "FICTIONAL-TOKEN-0003" };
    await newStore().transaction(async (tx) => {
      await tx.recordWsaaToken(SERVICE, FINGERPRINT, ISSUED);
      await tx.recordWsaaToken(SERVICE, "11:22:33", other);
      await tx.recordWsaaToken("ws_sr_padron_a13", FINGERPRINT, other);
    });

    expect(await newStore().transaction((tx) => tx.lockWsaaToken(SERVICE, FINGERPRINT))).toEqual(
      ISSUED,
    );
    expect(await newStore().transaction((tx) => tx.lockWsaaToken(SERVICE, "11:22:33"))).toEqual(
      other,
    );
  });

  it("leaves the previous token when the transaction fails after recording", async () => {
    await newStore().transaction((tx) => tx.recordWsaaToken(SERVICE, FINGERPRINT, ISSUED));
    const newer = { ...ISSUED, token: "FICTIONAL-TOKEN-0002" };

    await expect(
      newStore().transaction(async (tx) => {
        await tx.recordWsaaToken(SERVICE, FINGERPRINT, newer);
        throw new Error("the operation failed");
      }),
    ).rejects.toThrow("the operation failed");

    expect(await newStore().transaction((tx) => tx.lockWsaaToken(SERVICE, FINGERPRINT))).toEqual(
      ISSUED,
    );
  });

  it("makes a token due only for the certificate and service it was recorded for", async () => {
    await newStore().transaction((tx) => tx.recordWsaaToken(SERVICE, FINGERPRINT, ISSUED));
    let requests = 0;
    const authentication = {
      async requestToken() {
        requests += 1;
        return { kind: "issued" as const, token: { ...ISSUED, token: "FICTIONAL-TOKEN-0009" } };
      },
    };
    const renew = (certificateFingerprint: string) =>
      renewWsaaToken(
        { store: newStore(), authentication, clock: { now: () => NOW } },
        { service: SERVICE, certificateFingerprint },
      );

    expect(await renew(FINGERPRINT)).toEqual({ kind: "kept" });
    expect(await renew("11:22:33")).toEqual({ kind: "renewed" });
    expect(requests).toBe(1);
  });
});
