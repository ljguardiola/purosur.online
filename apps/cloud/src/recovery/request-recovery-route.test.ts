import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { recoveryRejectedAttemptAccumulator, users } from "../db/schema.js";
import type { RecoveryJobQueue, RecoveryRequest } from "./recovery-job-queue.js";
import { hashDestinationAddress } from "./recovery-rate-limiter.js";
import { registerRecoveryRoutes } from "./request-recovery-route.js";

const MIGRATIONS_FOLDER = new URL("../../migrations", import.meta.url).pathname;
const BACKOFFICE_ORIGIN = "https://staging.purosur.online";

let client: PGlite;
let db: PgliteDatabase<Record<string, never>>;
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

beforeEach(async () => {
  client = new PGlite();
  db = drizzle(client);
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

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
  await client.close();
});

function post(body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return app.inject({
    method: "POST",
    url: "/users/recovery/request",
    headers: { origin: BACKOFFICE_ORIGIN, "x-real-ip": "203.0.113.10", ...headers },
    payload: body,
  });
}

async function accumulatorRows() {
  return db.select().from(recoveryRejectedAttemptAccumulator);
}

describe("POST /users/recovery/request", () => {
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

  it("rejects a missing Origin header without enqueuing a job", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/users/recovery/request",
      headers: { "x-real-ip": "203.0.113.10" },
      payload: { email: "ada@example.com" },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
    expect(jobQueue.requests).toEqual([]);
  });

  it("rejects an Origin that does not match the backoffice's own origin", async () => {
    const response = await post({ email: "ada@example.com" }, { origin: "https://evil.example" });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
    expect(jobQueue.requests).toEqual([]);
  });

  it("rejects a missing email as validation_failed without enqueuing a job", async () => {
    const response = await post({});

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "validation_failed" });
    expect(jobQueue.requests).toEqual([]);
  });

  it("rejects a malformed email as validation_failed without enqueuing a job", async () => {
    const response = await post({ email: "not-an-email" });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "validation_failed" });
    expect(jobQueue.requests).toEqual([]);
  });

  it("rate-limits the 6th request per hour for the same destination address and enqueues no job", async () => {
    for (let i = 0; i < 5; i++) {
      const response = await post({ email: "ada@example.com" }, { "x-real-ip": `203.0.113.${i}` });
      expect(response.statusCode).toBe(200);
    }

    const sixth = await post({ email: "ada@example.com" }, { "x-real-ip": "203.0.113.99" });

    expect(sixth.statusCode).toBe(429);
    expect(sixth.json()).toMatchObject({ code: "rate_limited" });
    expect(sixth.headers["retry-after"]).toBeDefined();
    expect(jobQueue.requests).toHaveLength(5);
  });

  it("rejects an email longer than 254 characters as validation_failed without enqueuing a job", async () => {
    const response = await post({ email: `${"a".repeat(243)}@example.com` });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "validation_failed" });
    expect(jobQueue.requests).toEqual([]);
  });

  it("accepts an email of exactly 254 characters", async () => {
    const email = `${"a".repeat(242)}@example.com`;

    const response = await post({ email });

    expect(response.statusCode).toBe(200);
    expect(jobQueue.requests.map((request) => request.email)).toEqual([email]);
  });

  it("sends Retry-After as the seconds left until the limit frees a slot", async () => {
    for (let i = 0; i < 5; i++) {
      await post({ email: "ada@example.com" }, { "x-real-ip": `203.0.113.${i}` });
    }
    currentTime = new Date("2026-01-05T12:45:00.000Z");

    const sixth = await post({ email: "ada@example.com" }, { "x-real-ip": "203.0.113.99" });

    expect(sixth.statusCode).toBe(429);
    expect(sixth.headers["retry-after"]).toBe(String(15 * 60));
  });

  it("rate-limits the 11th request per hour from the same source address and enqueues no job", async () => {
    for (let i = 0; i < 10; i++) {
      const response = await post({ email: `user${i}@example.com` });
      expect(response.statusCode).toBe(200);
    }

    const eleventh = await post({ email: "one-too-many@example.com" });

    expect(eleventh.statusCode).toBe(429);
    expect(eleventh.json()).toMatchObject({ code: "rate_limited" });
    expect(jobQueue.requests).toHaveLength(10);
  });

  it("carries the time of the request in the job", async () => {
    await post({ email: "ada@example.com" });

    expect(jobQueue.requests).toEqual([{ email: "ada@example.com", requestedAt: currentTime }]);
  });

  it("checks the Origin before validating the body", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/users/recovery/request",
      headers: { origin: "https://evil.example", "x-real-ip": "203.0.113.10" },
      payload: {},
    });

    expect(response.statusCode).toBe(403);
  });

  describe("grouped audit of rate-limited rejections (H1)", () => {
    it("upserts the accumulator instead of enqueuing a job, without looking a registered address up", async () => {
      await db.insert(users).values({ firstName: "Ada", email: "ada@example.com" });
      for (let i = 0; i < 5; i++) {
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
        url: "/users/recovery/request",
        headers: { origin: BACKOFFICE_ORIGIN, "x-real-ip": "203.0.113.99" },
        payload: { email: "ada@example.com" },
      });
      await observedApp.close();

      expect(rejected.statusCode).toBe(429);
      expect(queries.length).toBeGreaterThan(0);
      expect(queries.filter((query) => query.includes('"users"'))).toEqual([]);
      expect(jobQueue.requests).toHaveLength(5);
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
      for (let i = 0; i < 10; i++) {
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
      for (let i = 0; i < 5; i++) {
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

  describe("bookkeeping failures never block the 429 response (H2)", () => {
    it("still answers 429 with Retry-After when recording the rejected attempt fails", async () => {
      for (let i = 0; i < 5; i++) {
        await post({ email: "ada@example.com" }, { "x-real-ip": `203.0.113.${i}` });
      }
      const reportError = vi.fn();
      const failingApp = buildApp({
        recordRejectedAttempt: vi.fn().mockRejectedValue(new Error("accumulator write failed")),
        reportError,
      });

      const response = await failingApp.inject({
        method: "POST",
        url: "/users/recovery/request",
        headers: {
          origin: BACKOFFICE_ORIGIN,
          "x-real-ip": "203.0.113.99",
          "content-type": "application/json",
        },
        payload: { email: "ada@example.com" },
      });

      expect(response.statusCode).toBe(429);
      expect(response.json()).toMatchObject({ code: "rate_limited" });
      expect(response.headers["retry-after"]).toBeDefined();
      expect(reportError).toHaveBeenCalledWith(expect.any(Error));

      await failingApp.close();
    });
  });
});
