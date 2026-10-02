import {
  RECOVERY_DESTINATION_ADDRESS_LIMIT,
  RECOVERY_RATE_LIMIT_WINDOW_MS,
  RECOVERY_SOURCE_ADDRESS_LIMIT,
} from "@purosur/domain";
import { drizzle } from "drizzle-orm/pglite";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { recoveryRejectedAttemptAccumulator, users } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import type { RecoveryJobQueue, RecoveryRequest } from "./recovery-job-queue.js";
import { hashDestinationAddress } from "./recovery-rate-limiter.js";
import { registerRecoveryRoutes } from "./request-recovery-route.js";

const BACKOFFICE_ORIGIN = "https://staging.purosur.online";

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let client: TestDatabase["client"];
let app: FastifyInstance;
let jobQueue: RecoveryJobQueue & { requests: RecoveryRequest[] };
let currentTime: Date;

type RecoveryRouteOverrides = Partial<
  Omit<Parameters<typeof registerRecoveryRoutes>[1], "db" | "jobQueue" | "backofficeOrigin" | "now">
>;

function buildApp(overrides: RecoveryRouteOverrides = {}) {
  const built = Fastify();
  registerRecoveryRoutes(built, {
    db,
    jobQueue,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    now: () => currentTime,
    ...overrides,
  });
  return built;
}

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
  client = testDatabase.client;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();

  const requests: RecoveryRequest[] = [];
  jobQueue = {
    requests,
    async enqueueRecoveryRequest(request) {
      requests.push(request);
    },
  };

  currentTime = new Date("2026-01-05T12:00:00.000Z");
  app = buildApp();
});

afterEach(async () => {
  await app.close();
});

function post(body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return app.inject({
    method: "POST",
    url: "/account-recoveries",
    headers: { origin: BACKOFFICE_ORIGIN, "x-real-ip": "203.0.113.10", ...headers },
    payload: body,
  });
}

async function accumulatorRows() {
  return db.select().from(recoveryRejectedAttemptAccumulator);
}

describe("POST /account-recoveries", () => {
  it("no longer answers the old recovery request path", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/users/recovery/request",
      headers: { origin: BACKOFFICE_ORIGIN, "x-real-ip": "203.0.113.10" },
      payload: { email: "ada@example.com" },
    });

    expect(response.statusCode).toBe(404);
  });

  it("answers 200 with no body and enqueues one job for a well-formed email", async () => {
    const response = await post({ email: "ada@example.com" });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe("");
    expect(jobQueue.requests).toEqual([{ email: "ada@example.com", requestedAt: currentTime }]);
  });

  it("answers identically whether or not the address belongs to a real account", async () => {
    const registered = await post({ email: "registered@example.com" });
    const unregistered = await post({ email: "unregistered@example.com" });

    expect(registered.statusCode).toBe(unregistered.statusCode);
    expect(registered.body).toBe(unregistered.body);
    expect(jobQueue.requests.map((request) => request.email)).toEqual([
      "registered@example.com",
      "unregistered@example.com",
    ]);
  });

  it("normalizes the email before enqueuing", async () => {
    await post({ email: "  ADA@Example.com  " });

    expect(jobQueue.requests.map((request) => request.email)).toEqual(["ada@example.com"]);
  });

  it("rejects an Origin that does not match the backoffice's own origin", async () => {
    const response = await post({ email: "ada@example.com" }, { origin: "https://evil.example" });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
    expect(jobQueue.requests).toEqual([]);
  });

  it("rejects a malformed email as validation_failed without enqueuing a job", async () => {
    const response = await post({ email: "not-an-email" });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "email" }],
    });
    expect(jobQueue.requests).toEqual([]);
  });

  it("rate-limits a request over the destination address's limit in the window and enqueues no job", async () => {
    for (let i = 0; i < RECOVERY_DESTINATION_ADDRESS_LIMIT; i++) {
      const response = await post({ email: "ada@example.com" }, { "x-real-ip": `203.0.113.${i}` });
      expect(response.statusCode).toBe(200);
    }

    const overTheLimit = await post({ email: "ada@example.com" }, { "x-real-ip": "203.0.113.99" });

    expect(overTheLimit.statusCode).toBe(429);
    expect(overTheLimit.json()).toMatchObject({ code: "rate_limited" });
    expect(overTheLimit.headers["retry-after"]).toBeDefined();
    expect(jobQueue.requests).toHaveLength(RECOVERY_DESTINATION_ADDRESS_LIMIT);
  });

  it("sends Retry-After as the seconds left until the limit frees a slot", async () => {
    for (let i = 0; i < RECOVERY_DESTINATION_ADDRESS_LIMIT; i++) {
      await post({ email: "ada@example.com" }, { "x-real-ip": `203.0.113.${i}` });
    }
    currentTime = new Date("2026-01-05T12:45:00.000Z");

    const overTheLimit = await post({ email: "ada@example.com" }, { "x-real-ip": "203.0.113.99" });

    expect(overTheLimit.statusCode).toBe(429);
    expect(overTheLimit.headers["retry-after"]).toBe(
      String((RECOVERY_RATE_LIMIT_WINDOW_MS - 45 * 60 * 1000) / 1000),
    );
  });

  it("rate-limits a request over the source address's limit in the window and enqueues no job", async () => {
    for (let i = 0; i < RECOVERY_SOURCE_ADDRESS_LIMIT; i++) {
      const response = await post({ email: `user${i}@example.com` });
      expect(response.statusCode).toBe(200);
    }

    const overTheLimit = await post({ email: "one-too-many@example.com" });

    expect(overTheLimit.statusCode).toBe(429);
    expect(overTheLimit.json()).toMatchObject({ code: "rate_limited" });
    expect(jobQueue.requests).toHaveLength(RECOVERY_SOURCE_ADDRESS_LIMIT);
  });

  it("carries the time of the request in the job", async () => {
    await post({ email: "ada@example.com" });

    expect(jobQueue.requests).toEqual([{ email: "ada@example.com", requestedAt: currentTime }]);
  });

  it("checks the Origin before validating the body", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/account-recoveries",
      headers: { origin: "https://evil.example", "x-real-ip": "203.0.113.10" },
      payload: {},
    });

    expect(response.statusCode).toBe(403);
  });

  describe("grouped audit of rate-limited rejections", () => {
    it("upserts the accumulator instead of enqueuing a job, without looking a registered address up", async () => {
      await db.insert(users).values({
        firstName: "Ada",
        email: "ada@example.com",
        locationId: await seededLocationId(db),
      });
      for (let i = 0; i < RECOVERY_DESTINATION_ADDRESS_LIMIT; i++) {
        await post({ email: "ada@example.com" }, { "x-real-ip": `203.0.113.${i}` });
      }
      const queries: string[] = [];
      const observedApp = Fastify();
      registerRecoveryRoutes(observedApp, {
        db: drizzle(client, { logger: { logQuery: (query) => queries.push(query) } }),
        jobQueue,
        backofficeOrigin: BACKOFFICE_ORIGIN,
        now: () => currentTime,
      });

      const rejected = await observedApp.inject({
        method: "POST",
        url: "/account-recoveries",
        headers: { origin: BACKOFFICE_ORIGIN, "x-real-ip": "203.0.113.99" },
        payload: { email: "ada@example.com" },
      });
      await observedApp.close();

      expect(rejected.statusCode).toBe(429);
      expect(queries.length).toBeGreaterThan(0);
      expect(queries.filter((query) => query.includes('"users"'))).toEqual([]);
      expect(jobQueue.requests).toHaveLength(RECOVERY_DESTINATION_ADDRESS_LIMIT);
      const rows = await accumulatorRows();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        kind: "request",
        keyHash: hashDestinationAddress("ada@example.com"),
        count: 1,
        firstAt: currentTime,
        lastAt: currentTime,
      });
    });

    it("does the identical accumulator work for an unregistered address, enqueuing no job either", async () => {
      for (let i = 0; i < RECOVERY_SOURCE_ADDRESS_LIMIT; i++) {
        await post({ email: `flood${i}@example.com` });
      }

      const rejected = await post({ email: "never-registered@example.com" });

      expect(rejected.statusCode).toBe(429);
      const rows = await accumulatorRows();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        kind: "request",
        keyHash: hashDestinationAddress("never-registered@example.com"),
        count: 1,
      });
    });

    it("accumulates count and last_at across repeated rejections in the same hour window", async () => {
      for (let i = 0; i < RECOVERY_DESTINATION_ADDRESS_LIMIT; i++) {
        await post({ email: "ada@example.com" }, { "x-real-ip": `203.0.113.${i}` });
      }
      await post({ email: "ada@example.com" }, { "x-real-ip": "203.0.113.90" });
      currentTime = new Date("2026-01-05T12:30:00.000Z");
      await post({ email: "ada@example.com" }, { "x-real-ip": "203.0.113.91" });

      const rows = await accumulatorRows();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        count: 2,
        firstAt: new Date("2026-01-05T12:00:00.000Z"),
        lastAt: new Date("2026-01-05T12:30:00.000Z"),
      });
    });
  });

  describe("bookkeeping failures never block the 429 response", () => {
    it("still answers 429 with Retry-After when recording the rejected attempt fails", async () => {
      for (let i = 0; i < RECOVERY_DESTINATION_ADDRESS_LIMIT; i++) {
        await post({ email: "ada@example.com" }, { "x-real-ip": `203.0.113.${i}` });
      }
      const reportError = vi.fn();
      const failingApp = buildApp({
        recordRejectedAttempt: vi.fn().mockRejectedValue(new Error("accumulator write failed")),
        reportError,
      });

      const response = await failingApp.inject({
        method: "POST",
        url: "/account-recoveries",
        headers: {
          origin: BACKOFFICE_ORIGIN,
          "x-real-ip": "203.0.113.99",
          "content-type": "application/json",
        },
        payload: { email: "ada@example.com" },
      });

      expect(response.statusCode).toBe(429);
      expect(response.json()).toMatchObject({ code: "rate_limited" });
      expect(response.headers["retry-after"]).toBe(String(RECOVERY_RATE_LIMIT_WINDOW_MS / 1000));
      expect(reportError).toHaveBeenCalledWith(expect.any(Error));

      await failingApp.close();
    });
  });
});
