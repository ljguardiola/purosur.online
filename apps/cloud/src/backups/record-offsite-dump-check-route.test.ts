import { offsiteDumpCheckRecordedSchema } from "@purosur/contracts";
import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { offsiteDumpChecks } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { registerRecordOffsiteDumpCheckRoute } from "./record-offsite-dump-check-route.js";

const NOW = new Date("2026-10-14T12:00:00.000Z");
const TOKEN = "offsite-dump-check-token-for-tests";
const NIGHT = "2026-10-14";

let testDatabase: TestDatabase;
let app: FastifyInstance;

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
  app = Fastify();
  registerRecordOffsiteDumpCheckRoute(app, {
    db: testDatabase.db,
    offsiteDumpCheckToken: TOKEN,
    now: () => NOW,
  });
});

afterEach(async () => {
  await app.close();
});

function report(body: unknown, authorization: string | null = `Bearer ${TOKEN}`) {
  return app.inject({
    method: "POST",
    url: "/backups/offsite-dump-checks",
    payload: body as object,
    headers: authorization === null ? {} : { authorization },
  });
}

async function recordedNights() {
  return testDatabase.db.select().from(offsiteDumpChecks);
}

describe("POST /backups/offsite-dump-checks", () => {
  it("answers 401 without the token, recording nothing", async () => {
    const response = await report({ night: NIGHT, outcome: "passed", sizeBytes: 10 }, null);

    expect(response.statusCode).toBe(401);
    expect(await recordedNights()).toEqual([]);
  });

  it("answers 401 to another token, recording nothing", async () => {
    const response = await report(
      { night: NIGHT, outcome: "passed", sizeBytes: 10 },
      "Bearer another-token",
    );

    expect(response.statusCode).toBe(401);
    expect(await recordedNights()).toEqual([]);
  });

  it("refuses a body that does not match the report with 400 validation_failed", async () => {
    const response = await report({ night: NIGHT, outcome: "passed" });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "validation_failed" });
    expect(await recordedNights()).toEqual([]);
  });

  it("records a passed report and answers the night as verified", async () => {
    const response = await report({ night: NIGHT, outcome: "passed", sizeBytes: 2048 });

    expect(response.statusCode).toBe(200);
    expect(offsiteDumpCheckRecordedSchema.parse(response.json())).toEqual({
      night: NIGHT,
      status: "verified",
      sizeBytes: 2048,
    });
    const [row] = await testDatabase.db
      .select({ status: offsiteDumpChecks.status })
      .from(offsiteDumpChecks)
      .where(eq(offsiteDumpChecks.night, NIGHT));
    expect(row?.status).toBe("verified");
  });

  it("records a failed report and answers the night as failed with its reason", async () => {
    const response = await report({ night: NIGHT, outcome: "failed", reason: "hash_mismatch" });

    expect(response.statusCode).toBe(200);
    expect(offsiteDumpCheckRecordedSchema.parse(response.json())).toEqual({
      night: NIGHT,
      status: "failed",
      reason: "hash_mismatch",
    });
    expect(await recordedNights()).toHaveLength(1);
  });
});
