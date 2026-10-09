import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { arcaWsaaTokens } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleWsaaTokenSource } from "./drizzle-wsaa-token-source.js";

const NOW = new Date("2026-10-06T15:00:00.000Z");
const HOUR_MS = 60 * 60 * 1000;
const FINGERPRINT = "AB:CD:EF";

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

function sourceAt(now: Date, certificateFingerprint = FINGERPRINT) {
  return new DrizzleWsaaTokenSource(
    testDatabase.db,
    { now: () => now },
    "wsfe",
    certificateFingerprint,
  );
}

async function insertToken(expiresAt: Date, service = "wsfe", fingerprint = FINGERPRINT) {
  await testDatabase.db.insert(arcaWsaaTokens).values({
    service,
    certificateFingerprint: fingerprint,
    token: "FICTIONAL-TOKEN",
    sign: "FICTIONAL-SIGN",
    issuedAt: new Date(NOW.getTime() - HOUR_MS),
    expiresAt,
  });
}

describe("DrizzleWsaaTokenSource", () => {
  it("has no token before one was ever issued", async () => {
    await expect(sourceAt(NOW).validToken()).resolves.toBeNull();
  });

  it("gives the persisted token while it has not expired", async () => {
    const expiresAt = new Date(NOW.getTime() + HOUR_MS);
    await insertToken(expiresAt);

    await expect(sourceAt(NOW).validToken()).resolves.toEqual({
      token: "FICTIONAL-TOKEN",
      sign: "FICTIONAL-SIGN",
      issuedAt: new Date(NOW.getTime() - HOUR_MS),
      expiresAt,
    });
  });

  it("gives no token once the persisted one expired", async () => {
    await insertToken(NOW);

    await expect(sourceAt(NOW).validToken()).resolves.toBeNull();
  });

  it("gives no token that was issued for another service or another certificate", async () => {
    await insertToken(new Date(NOW.getTime() + HOUR_MS), "ws_sr_padron_a13");
    await insertToken(new Date(NOW.getTime() + HOUR_MS), "wsfe", "00:11:22");

    await expect(sourceAt(NOW).validToken()).resolves.toBeNull();
  });
});
