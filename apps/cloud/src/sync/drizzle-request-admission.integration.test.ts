import { INSTALLATION_REQUEST_LIMITS } from "@purosur/domain";
import { admitInstallationRequest } from "@purosur/domain/sync/use-cases";
import { and, eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { installationRequestAttempts } from "../platform/db/schema.js";
import { insertEnrolledInstallation as enrollInstallation } from "../register/test-support/enrolled-installation.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { DrizzleRequestAdmission } from "./drizzle-request-admission.js";
import { insertAdmittedRequests } from "./test-support/admitted-requests.js";

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("drizzle_request_admission");
  sql = postgres(integrationDb.databaseUrl, { max: 4 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

const NOW = new Date("2026-10-01T12:00:00.000Z");
const A_MINUTE_AGO = new Date(NOW.getTime() - 60_000);
const TWO_HOURS_AGO = new Date(NOW.getTime() - 2 * 60 * 60 * 1000);

let registerCount = 0;

function insertEnrolledInstallation() {
  registerCount += 1;
  return enrollInstallation(db, { now: NOW, registerName: `Caja ${registerCount}` });
}

function admit(deviceId: string, endpoint: "push" | "pull" | "health_check") {
  return admitInstallationRequest(
    { admission: new DrizzleRequestAdmission(db), clock: { now: () => NOW } },
    { deviceId, endpoint },
  );
}

function attemptsOf(deviceId: string, endpoint: "push" | "pull" | "health_check") {
  return db
    .select({ attemptedAt: installationRequestAttempts.attemptedAt })
    .from(installationRequestAttempts)
    .where(
      and(
        eq(installationRequestAttempts.deviceId, deviceId),
        eq(installationRequestAttempts.endpoint, endpoint),
      ),
    );
}

describe("the request admission on a real Postgres", () => {
  it("records an admitted request with the time it was admitted", async () => {
    const { deviceId } = await insertEnrolledInstallation();

    expect(await admit(deviceId, "pull")).toEqual({ kind: "admitted" });

    expect(await attemptsOf(deviceId, "pull")).toEqual([{ attemptedAt: NOW }]);
  });

  it("counts only the requests of the installation and the endpoint asked about", async () => {
    const first = await insertEnrolledInstallation();
    const second = await insertEnrolledInstallation();
    await insertAdmittedRequests(db, second.deviceId, "push", A_MINUTE_AGO, 5);
    await insertAdmittedRequests(db, first.deviceId, "pull", A_MINUTE_AGO, 5);
    const admission = new DrizzleRequestAdmission(db);

    const counted = await admission.transaction((tx) =>
      tx.admittedRequests(first.deviceId, "push", new Date(NOW.getTime() - 3_600_000)),
    );

    expect(counted).toEqual([]);
  });

  it("reads only the requests after the moment it is given", async () => {
    const { deviceId } = await insertEnrolledInstallation();
    await insertAdmittedRequests(db, deviceId, "push", TWO_HOURS_AGO, 2);
    await insertAdmittedRequests(db, deviceId, "push", A_MINUTE_AGO, 3);

    const counted = await new DrizzleRequestAdmission(db).transaction((tx) =>
      tx.admittedRequests(deviceId, "push", new Date(NOW.getTime() - 3_600_000)),
    );

    expect(counted).toEqual([A_MINUTE_AGO, A_MINUTE_AGO, A_MINUTE_AGO]);
  });

  it("forgets, once it admits a request, the ones of that installation and endpoint that left the window, and no other", async () => {
    const first = await insertEnrolledInstallation();
    const second = await insertEnrolledInstallation();
    await insertAdmittedRequests(db, first.deviceId, "push", TWO_HOURS_AGO, 2);
    await insertAdmittedRequests(db, first.deviceId, "pull", TWO_HOURS_AGO, 1);
    await insertAdmittedRequests(db, second.deviceId, "push", TWO_HOURS_AGO, 1);

    await admit(first.deviceId, "push");

    expect(await attemptsOf(first.deviceId, "push")).toEqual([{ attemptedAt: NOW }]);
    expect(await attemptsOf(first.deviceId, "pull")).toHaveLength(1);
    expect(await attemptsOf(second.deviceId, "push")).toHaveLength(1);
  });

  it("admits exactly one of two requests that race for the last place under the limit", async () => {
    const { deviceId } = await insertEnrolledInstallation();
    await insertAdmittedRequests(
      db,
      deviceId,
      "health_check",
      A_MINUTE_AGO,
      INSTALLATION_REQUEST_LIMITS.health_check - 1,
    );

    const outcomes = await Promise.all([
      admit(deviceId, "health_check"),
      admit(deviceId, "health_check"),
    ]);

    expect(outcomes.map((outcome) => outcome.kind).sort()).toEqual(["admitted", "rate_limited"]);
    expect(await attemptsOf(deviceId, "health_check")).toHaveLength(
      INSTALLATION_REQUEST_LIMITS.health_check,
    );
  });
});
