import type {
  NoMovementDeclarationAnswer,
  NoMovementDeclarationCall,
  NoMovementDeclarationLookupAnswer,
  TaxAuthorityNoMovementDeclarations,
  TaxAuthorityOfflineAuthorizationCodes,
} from "@purosur/domain/fiscal/use-cases";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { arcaWsaaTokens, fortnightReports, pointOfSaleClaims } from "../platform/db/schema.js";
import { scheduleOfCrontabLine } from "../platform/test-support/crontab-schedule.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { insertInboxEvent } from "../sync/test-support/inbox-events.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { buildJobHelpers } from "../test-support/job-helpers.js";
import { DrizzleOfflineAuthorizationCodeStore } from "./drizzle-offline-authorization-code-store.js";
import { FORTNIGHT_REPORT_TASK_IDENTIFIER, fortnightReportJobs } from "./fortnight-report-task.js";
import { seedOfflinePointOfSale } from "./test-support/offline-point-of-sale-fixtures.js";

const NOW = new Date("2026-10-16T15:00:00.000Z");
const FINGERPRINT = "AB:CD:EF";
const OCTOBER_FIRST_HALF = { start: "2026-10-01", end: "2026-10-15" };
const OFFLINE_POINT_OF_SALE = 8;

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

class FakeDeclarations implements TaxAuthorityNoMovementDeclarations {
  readonly lookedUp: NoMovementDeclarationCall[] = [];
  readonly declared: NoMovementDeclarationCall[] = [];
  lookUpAnswer: NoMovementDeclarationLookupAnswer = { kind: "not_held" };
  declareAnswer: NoMovementDeclarationAnswer = { kind: "accepted" };

  async lookUp(call: NoMovementDeclarationCall) {
    this.lookedUp.push(call);
    return this.lookUpAnswer;
  }

  async declare(call: NoMovementDeclarationCall) {
    this.declared.push(call);
    return this.declareAnswer;
  }
}

const unusedCodeAuthority: TaxAuthorityOfflineAuthorizationCodes = {
  async request() {
    return { kind: "no_answer" };
  },
  async lookUp() {
    return { kind: "no_answer" };
  },
};

async function issueWsaaToken() {
  await testDatabase.db.insert(arcaWsaaTokens).values({
    service: "wsfe",
    certificateFingerprint: FINGERPRINT,
    token: "FICTIONAL-TOKEN",
    sign: "FICTIONAL-SIGN",
    issuedAt: new Date(NOW.getTime() - 60_000),
    expiresAt: new Date(NOW.getTime() + 60 * 60_000),
  });
}

async function owedFortnight({ syncedPastClose }: { syncedPastClose: boolean }) {
  const registerId = await seedOfflinePointOfSale(testDatabase.db);
  await testDatabase.asMigrator(() =>
    testDatabase.db
      .update(pointOfSaleClaims)
      .set({ claimedAt: new Date("2026-09-20T12:00:00.000Z") })
      .where(eq(pointOfSaleClaims.pointOfSaleNumber, OFFLINE_POINT_OF_SALE)),
  );
  await new DrizzleOfflineAuthorizationCodeStore(testDatabase.db).holdAcquisition(
    OCTOBER_FIRST_HALF,
    (acquisition) =>
      acquisition.keep({
        code: {
          code: "36123456789012",
          fortnight: OCTOBER_FIRST_HALF,
          reportDeadline: "2026-10-20",
        },
        obtainedAt: new Date("2026-09-28T12:00:00.000Z"),
        obtainedThrough: "requested",
      }),
  );
  const { deviceId } = await insertEnrolledInstallation(testDatabase.db, {
    now: NOW,
    existingRegisterId: registerId,
  });
  await insertInboxEvent(testDatabase.db, deviceId, {
    occurredAt: new Date(syncedPastClose ? "2026-10-16T10:00:00.000Z" : "2026-10-15T20:00:00.000Z"),
  });
  await issueWsaaToken();
}

function taskUnderTest(declarations: TaxAuthorityNoMovementDeclarations, report = vi.fn()) {
  const jobs = fortnightReportJobs(
    {
      now: () => NOW,
      declarations,
      codeAuthority: unusedCodeAuthority,
      certificateFingerprint: FINGERPRINT,
    },
    { createDatabase: () => testDatabase.db, report },
  );
  const task = jobs.taskList[FORTNIGHT_REPORT_TASK_IDENTIFIER];
  if (!task) {
    throw new Error("test setup: expected the registered fortnight report task");
  }
  return { jobs, task, report };
}

describe("fortnightReportJobs", () => {
  it("registers the task and schedules it every ten minutes", () => {
    const { jobs } = taskUnderTest(new FakeDeclarations());

    const schedules = jobs.crontab.map(scheduleOfCrontabLine);
    expect(schedules.map((schedule) => schedule.task)).toEqual([FORTNIGHT_REPORT_TASK_IDENTIFIER]);
    expect(new Set(schedules[0]?.gapsMs)).toEqual(new Set([10 * 60 * 1000]));
  });

  it("declares a closed fortnight with nothing to report through a client borrowed from the worker and records it as accepted", async () => {
    await owedFortnight({ syncedPastClose: true });
    const declarations = new FakeDeclarations();
    const { task } = taskUnderTest(declarations);
    const { helpers, borrowClient } = buildJobHelpers();

    await task({}, helpers);

    expect(borrowClient).toHaveBeenCalledTimes(1);
    expect(
      declarations.declared.map(({ pointOfSaleNumber, code, token }) => ({
        pointOfSaleNumber,
        code,
        token: token.token,
      })),
    ).toEqual([{ pointOfSaleNumber: 8, code: "36123456789012", token: "FICTIONAL-TOKEN" }]);
    expect(
      await testDatabase.db
        .select({ state: fortnightReports.state, recordedAt: fortnightReports.recordedAt })
        .from(fortnightReports),
    ).toEqual([{ state: "accepted", recordedAt: NOW }]);
  });

  it("records the fortnight as blocked and declares nothing while the register's events do not reach past its close", async () => {
    await owedFortnight({ syncedPastClose: false });
    const declarations = new FakeDeclarations();
    const { task } = taskUnderTest(declarations);

    await task({}, buildJobHelpers().helpers);

    expect(declarations.declared).toEqual([]);
    expect(
      await testDatabase.db.select({ state: fortnightReports.state }).from(fortnightReports),
    ).toEqual([{ state: "blocked" }]);
  });

  it("does nothing while there is no valid token to ask with", async () => {
    await owedFortnight({ syncedPastClose: true });
    await testDatabase.db.delete(arcaWsaaTokens);
    const declarations = new FakeDeclarations();
    const { task } = taskUnderTest(declarations);

    await task({}, buildJobHelpers().helpers);

    expect(declarations.lookedUp).toEqual([]);
    expect(await testDatabase.db.select().from(fortnightReports)).toEqual([]);
  });
});

describe("the log and the error report of a fortnight report run", () => {
  it("logs each presentation's outcome and reports a refusal with its rejections", async () => {
    await owedFortnight({ syncedPastClose: true });
    const declarations = new FakeDeclarations();
    declarations.declareAnswer = {
      kind: "refused",
      rejections: [{ code: 1202, message: "Fictional rejection" }],
    };
    const { task, report } = taskUnderTest(declarations);
    const { helpers, logs } = buildJobHelpers();

    await task({}, helpers);

    expect(logs).toEqual([
      {
        level: "info",
        message:
          "fortnight report of point of sale 8 for fortnight 2026-10-01..2026-10-15: refused (1202: Fictional rejection)",
      },
    ]);
    expect(report).toHaveBeenCalledWith(expect.any(String), expect.any(Error), {
      context: {
        pointOfSaleNumber: 8,
        fortnightStart: "2026-10-01",
        fortnightEnd: "2026-10-15",
        outcome: "refused",
        rejections: "1202: Fictional rejection",
      },
    });
  });

  it("logs an accepted presentation without reporting it", async () => {
    await owedFortnight({ syncedPastClose: true });
    const { task, report } = taskUnderTest(new FakeDeclarations());

    await task({}, buildJobHelpers().helpers);

    expect(report).not.toHaveBeenCalled();
  });

  it("logs a run with nothing owed at debug level only", async () => {
    await issueWsaaToken();
    const { task } = taskUnderTest(new FakeDeclarations());
    const { helpers, logs } = buildJobHelpers();

    await task({}, helpers);

    expect(logs.map(({ level }) => level)).toEqual(["debug"]);
  });
});
