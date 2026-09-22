import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { RecoveryJobQueue } from "./recovery-job-queue.js";
import { registerRecoveryRoutes } from "./request-recovery-route.js";

const MIGRATIONS_FOLDER = new URL("../../migrations", import.meta.url).pathname;
const BACKOFFICE_ORIGIN = "https://staging.purosur.online";

let client: PGlite;
let db: PgliteDatabase<Record<string, never>>;
let app: FastifyInstance;
let jobQueue: RecoveryJobQueue & { enqueued: string[] };

beforeEach(async () => {
  client = new PGlite();
  db = drizzle(client);
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

  const enqueued: string[] = [];
  jobQueue = {
    enqueued,
    async enqueueRecoveryRequest(email) {
      enqueued.push(email);
    },
  };

  app = Fastify();
  registerRecoveryRoutes(app, {
    db,
    jobQueue,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    now: () => new Date("2026-01-05T12:00:00.000Z"),
  });
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

describe("POST /users/recovery/request", () => {
  it("answers 200 with no body and enqueues one job for a well-formed email", async () => {
    const response = await post({ email: "ada@example.com" });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe("");
    expect(jobQueue.enqueued).toEqual(["ada@example.com"]);
  });

  it("answers identically whether or not the address belongs to a real account", async () => {
    const registered = await post({ email: "registered@example.com" });
    const unregistered = await post({ email: "unregistered@example.com" });

    expect(registered.statusCode).toBe(unregistered.statusCode);
    expect(registered.body).toBe(unregistered.body);
    expect(jobQueue.enqueued).toEqual(["registered@example.com", "unregistered@example.com"]);
  });

  it("normalizes the email before enqueuing", async () => {
    await post({ email: "  ADA@Example.com  " });

    expect(jobQueue.enqueued).toEqual(["ada@example.com"]);
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
    expect(jobQueue.enqueued).toEqual([]);
  });

  it("rejects an Origin that does not match the backoffice's own origin", async () => {
    const response = await post({ email: "ada@example.com" }, { origin: "https://evil.example" });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
    expect(jobQueue.enqueued).toEqual([]);
  });

  it("rejects a missing email as validation_failed without enqueuing a job", async () => {
    const response = await post({});

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "validation_failed" });
    expect(jobQueue.enqueued).toEqual([]);
  });

  it("rejects a malformed email as validation_failed without enqueuing a job", async () => {
    const response = await post({ email: "not-an-email" });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "validation_failed" });
    expect(jobQueue.enqueued).toEqual([]);
  });

  it("rate-limits the 6th request per hour for the same destination address and enqueues nothing", async () => {
    for (let i = 0; i < 5; i++) {
      const response = await post({ email: "ada@example.com" }, { "x-real-ip": `203.0.113.${i}` });
      expect(response.statusCode).toBe(200);
    }

    const sixth = await post({ email: "ada@example.com" }, { "x-real-ip": "203.0.113.99" });

    expect(sixth.statusCode).toBe(429);
    expect(sixth.json()).toMatchObject({ code: "rate_limited" });
    expect(sixth.headers["retry-after"]).toBeDefined();
    expect(jobQueue.enqueued).toEqual([
      "ada@example.com",
      "ada@example.com",
      "ada@example.com",
      "ada@example.com",
      "ada@example.com",
    ]);
  });

  it("rate-limits the 11th request per hour from the same source address and enqueues nothing", async () => {
    for (let i = 0; i < 10; i++) {
      const response = await post({ email: `user${i}@example.com` });
      expect(response.statusCode).toBe(200);
    }

    const eleventh = await post({ email: "one-too-many@example.com" });

    expect(eleventh.statusCode).toBe(429);
    expect(eleventh.json()).toMatchObject({ code: "rate_limited" });
    expect(jobQueue.enqueued).toHaveLength(10);
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
});
