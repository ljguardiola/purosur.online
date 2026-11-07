import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  BACKOFFICE_ORIGIN,
  openBackofficeSession,
  SESSION_NOON,
} from "../test-support/backoffice-session.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { fixedZoneRulesSource } from "../test-support/fixed-zone-rules-source.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { registerCurrentOfflineAuthorizationCodeRoute } from "./current-offline-authorization-code-route.js";
import { DrizzleOfflineAuthorizationCodeStore } from "./drizzle-offline-authorization-code-store.js";

const JANUARY_FIRST_HALF = { start: "2026-01-01", end: "2026-01-15" };
const JANUARY_SECOND_HALF = { start: "2026-01-16", end: "2026-01-31" };

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let app: FastifyInstance;

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
  app = Fastify();
  registerCurrentOfflineAuthorizationCodeRoute(app, {
    zoneRules: fixedZoneRulesSource(),
    db,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    now: () => SESSION_NOON,
  });
});

afterEach(async () => {
  await app.close();
});

function readCode(headers: Record<string, string>) {
  return app.inject({
    method: "GET",
    url: "/fiscal/current-offline-authorization-code",
    headers,
  });
}

function keep(fortnight: { start: string; end: string }, code: string, reportDeadline: string) {
  return new DrizzleOfflineAuthorizationCodeStore(db).holdAcquisition(fortnight, (acquisition) =>
    acquisition.keep({
      code: { code, fortnight, reportDeadline },
      obtainedAt: new Date("2025-12-28T12:00:00.000Z"),
      obtainedThrough: "requested",
    }),
  );
}

async function aFiscalInformationSession() {
  return openBackofficeSession(db, {
    now: SESSION_NOON,
    locationId: await seededLocationId(db),
    permissionKeys: ["view_fiscal_documents"],
  });
}

describe("GET /fiscal/current-offline-authorization-code", () => {
  it("returns 401 unauthenticated when no cookie was sent", async () => {
    const response = await readCode({ origin: BACKOFFICE_ORIGIN });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("rejects a user without access to fiscal information with 403 forbidden", async () => {
    const session = await openBackofficeSession(db, {
      now: SESSION_NOON,
      locationId: await seededLocationId(db),
      permissionKeys: ["enroll_register_devices"],
    });

    const response = await readCode(session.headers);

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
  });

  it("answers the code stored for the current fortnight with its fortnight and report deadline", async () => {
    await keep(JANUARY_FIRST_HALF, "36123456789012", "2026-01-20");
    await keep(JANUARY_SECOND_HALF, "36123456789013", "2026-02-05");
    const session = await aFiscalInformationSession();

    const response = await readCode(session.headers);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      offline_authorization_code: {
        code: "36123456789012",
        fortnight_start: "2026-01-01",
        fortnight_end: "2026-01-15",
        report_deadline: "2026-01-20",
      },
    });
  });

  it("answers none when the current fortnight's code is not stored yet", async () => {
    await keep(JANUARY_SECOND_HALF, "36123456789013", "2026-02-05");
    const session = await aFiscalInformationSession();

    const response = await readCode(session.headers);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ offline_authorization_code: null });
  });
});
