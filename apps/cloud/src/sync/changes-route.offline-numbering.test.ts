import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { DrizzleOfflineAuthorizationCodeStore } from "../fiscal/drizzle-offline-authorization-code-store.js";
import { configureOfflinePointOfSale } from "../fiscal/test-support/offline-point-of-sale-fixtures.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { buildChangesRouteApp, pulledPage } from "./test-support/changes-route.js";

const NOW = new Date("2026-09-29T12:00:00.000Z");
const SEPTEMBER_SECOND_HALF = { start: "2026-09-16", end: "2026-09-30" };
const OCTOBER_FIRST_HALF = { start: "2026-10-01", end: "2026-10-15" };

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let app: FastifyInstance;
const enqueueRequest = vi.fn<() => Promise<void>>();

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
  enqueueRequest.mockReset();
  enqueueRequest.mockResolvedValue(undefined);
  app = buildChangesRouteApp(db, {
    now: () => NOW,
    enqueueOfflineAuthorizationCodeRequest: enqueueRequest,
  });
});

afterEach(async () => {
  await app.close();
});

async function pulledRows(deviceToken: string, entity: string) {
  return (await pulledPage(app, 0, deviceToken)).changes
    .filter((change) => change.entity === entity)
    .map((change) => ("row" in change ? change.row : undefined));
}

async function keepCode(
  fortnight: { start: string; end: string },
  code: string,
  reportDeadline: string,
) {
  await new DrizzleOfflineAuthorizationCodeStore(db).holdAcquisition(fortnight, (acquisition) =>
    acquisition.keep({
      code: { code, fortnight, reportDeadline },
      obtainedAt: NOW,
      obtainedThrough: "requested",
    }),
  );
}

async function installedRegisterWithOfflinePointOfSale(): Promise<string> {
  const registerId = await configureOfflinePointOfSale(db, {
    registerName: "Caja 1",
    realTimePointOfSale: 7,
    offlinePointOfSale: 8,
    now: NOW,
  });
  const { deviceToken } = await insertEnrolledInstallation(db, {
    now: NOW,
    existingRegisterId: registerId,
  });
  return deviceToken;
}

describe("GET /changes carrying the offline authorization codes", () => {
  it("gives a register every code with the fortnight it covers and its report deadline", async () => {
    await keepCode(SEPTEMBER_SECOND_HALF, "36123456789012", "2026-10-12");
    await keepCode(OCTOBER_FIRST_HALF, "36123456789013", "2026-10-27");
    const deviceToken = await installedRegisterWithOfflinePointOfSale();

    expect(await pulledRows(deviceToken, "offline_authorization_code")).toEqual([
      {
        fortnight_start: "2026-09-16",
        fortnight_end: "2026-09-30",
        code: "36123456789012",
        report_deadline: "2026-10-12",
        version: 1,
      },
      {
        fortnight_start: "2026-10-01",
        fortnight_end: "2026-10-15",
        code: "36123456789013",
        report_deadline: "2026-10-27",
        version: 1,
      },
    ]);
  });
});

describe("GET /changes carrying the offline number blocks", () => {
  it("gives a register the block of its own offline point of sale with its range and status", async () => {
    const deviceToken = await installedRegisterWithOfflinePointOfSale();

    expect(await pulledRows(deviceToken, "offline_number_block")).toEqual([
      {
        point_of_sale_number: 8,
        document_type: "factura_c",
        first_number: 1,
        last_number: 1000,
        status: "in_use",
        version: 1,
      },
    ]);
  });
});

describe("GET /changes asking for the current fortnight's offline authorization code", () => {
  it("requests it while the cloud holds none for the fortnight the register is in", async () => {
    const deviceToken = await installedRegisterWithOfflinePointOfSale();
    await keepCode(OCTOBER_FIRST_HALF, "36123456789013", "2026-10-27");

    await pulledPage(app, 0, deviceToken);

    expect(enqueueRequest).toHaveBeenCalledTimes(1);
  });

  it("still delivers the page and reports the failure when the request cannot be enqueued", async () => {
    const failure = new Error("the job queue is down");
    const reportError = vi.fn();
    const failing = buildChangesRouteApp(db, {
      now: () => NOW,
      enqueueOfflineAuthorizationCodeRequest: () => Promise.reject(failure),
      reportError,
    });
    const deviceToken = await installedRegisterWithOfflinePointOfSale();

    const page = await pulledPage(failing, 0, deviceToken);
    await failing.close();

    expect(page.changes.map(({ entity }) => entity)).toContain("offline_number_block");
    expect(reportError).toHaveBeenCalledWith(failure);
  });

  it("still answers when the cloud has no way to request codes", async () => {
    const quiet = buildChangesRouteApp(db, { now: () => NOW });
    const deviceToken = await installedRegisterWithOfflinePointOfSale();

    const page = await pulledPage(quiet, 0, deviceToken);
    await quiet.close();

    expect(page.changes).not.toEqual([]);
  });
});
