import {
  renewWsaaToken,
  type WsaaAuthentication,
  type WsaaToken,
} from "@purosur/domain/fiscal/use-cases";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { runQueuedBehindHeldLock } from "../test-support/queued-behind-held-lock.js";
import { DrizzleWsaaTokenStore, wsaaTokenLockKey } from "./drizzle-wsaa-token-store.js";

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

class CountingAuthentication implements WsaaAuthentication {
  requests = 0;

  async requestToken() {
    this.requests += 1;
    return { kind: "issued" as const, token: ISSUED };
  }
}

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("wsaa_token_store");
  sql = postgres(integrationDb.databaseUrl, { max: 10 });
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

function renewWith(client: ReturnType<typeof postgres>, authentication: WsaaAuthentication) {
  return renewWsaaToken(
    {
      store: new DrizzleWsaaTokenStore(drizzle(client)),
      authentication,
      clock: { now: () => NOW },
    },
    { service: SERVICE, certificateFingerprint: FINGERPRINT },
  );
}

describe("the WSAA token store on a real Postgres", () => {
  it("reuses a persisted token through a new connection without calling WSAA", async () => {
    const firstProcess = postgres(integrationDb.databaseUrl, { max: 1 });
    const issuing = new CountingAuthentication();
    expect(await renewWith(firstProcess, issuing)).toEqual({ kind: "renewed" });
    await firstProcess.end({ timeout: 1 });

    const restartedProcess = postgres(integrationDb.databaseUrl, { max: 1 });
    const unusedAuthentication = new CountingAuthentication();
    try {
      expect(await renewWith(restartedProcess, unusedAuthentication)).toEqual({ kind: "kept" });
    } finally {
      await restartedProcess.end({ timeout: 1 });
    }
    expect(unusedAuthentication.requests).toBe(0);
  });

  it("calls WSAA once when two renewals start together on an empty table", async () => {
    await sql`delete from arca_wsaa_tokens`;
    const authentication = new CountingAuthentication();

    const outcomes = await runQueuedBehindHeldLock(
      sql,
      (holder) =>
        holder`select pg_advisory_xact_lock(hashtextextended(${wsaaTokenLockKey(SERVICE, FINGERPRINT)}, 0))`,
      () => renewWith(sql, authentication),
      () => renewWith(sql, authentication),
    );

    expect(outcomes.map(({ kind }) => kind)).toEqual(["renewed", "kept"]);
    expect(authentication.requests).toBe(1);
  });
});
