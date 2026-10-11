import { OFFLINE_AUTHORIZATION_CODE_ACQUISITION_RETRY_INTERVAL_MS } from "@purosur/domain";
import type {
  OfflineAuthorizationCodeCall,
  OfflineAuthorizationCodeLookupAnswer,
  OfflineAuthorizationCodeRequestAnswer,
  TaxAuthorityOfflineAuthorizationCodes,
} from "@purosur/domain/fiscal/use-cases";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  arcaWsaaTokens,
  caeaCodes,
  offlineAuthorizationCodeAcquisitionReports,
} from "../platform/db/schema.js";
import { scheduleOfCrontabLine } from "../platform/test-support/crontab-schedule.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { buildJobHelpers } from "../test-support/job-helpers.js";
import {
  OFFLINE_AUTHORIZATION_CODE_REQUEST_TASK_IDENTIFIER,
  OFFLINE_AUTHORIZATION_CODE_TASK_IDENTIFIER,
  offlineAuthorizationCodeJobs,
} from "./offline-authorization-code-task.js";
import { seedOfflinePointOfSale } from "./test-support/offline-point-of-sale-fixtures.js";

const NOW = new Date("2026-10-03T15:00:00.000Z");
const FINGERPRINT = "AB:CD:EF";
const OCTOBER_FIRST_HALF = { start: "2026-10-01", end: "2026-10-15" };

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

class FakeOfflineAuthorizationCodes implements TaxAuthorityOfflineAuthorizationCodes {
  readonly requests: OfflineAuthorizationCodeCall[] = [];
  requestAnswer: OfflineAuthorizationCodeRequestAnswer = {
    kind: "granted",
    code: {
      code: "36123456789012",
      fortnight: OCTOBER_FIRST_HALF,
      reportDeadline: "2026-10-20",
    },
  };

  async request(call: OfflineAuthorizationCodeCall) {
    this.requests.push(call);
    return this.requestAnswer;
  }

  async lookUp(): Promise<OfflineAuthorizationCodeLookupAnswer> {
    return { kind: "no_answer" };
  }
}

async function issueWsaaToken(at: Date = NOW) {
  await testDatabase.db.insert(arcaWsaaTokens).values({
    service: "wsfe",
    certificateFingerprint: FINGERPRINT,
    token: "FICTIONAL-TOKEN",
    sign: "FICTIONAL-SIGN",
    issuedAt: new Date(at.getTime() - 60_000),
    expiresAt: new Date(at.getTime() + 60 * 60_000),
  });
}

function taskUnderTest(taxAuthority: TaxAuthorityOfflineAuthorizationCodes) {
  const jobs = offlineAuthorizationCodeJobs(
    { now: () => NOW, taxAuthority, certificateFingerprint: FINGERPRINT },
    { createDatabase: () => testDatabase.db, report: vi.fn() },
  );
  const task = jobs.taskList[OFFLINE_AUTHORIZATION_CODE_TASK_IDENTIFIER];
  if (!task) {
    throw new Error("test setup: expected the registered offline authorization code task");
  }
  return { jobs, task };
}

describe("offlineAuthorizationCodeJobs", () => {
  it("registers the acquisition task and schedules it at the domain's acquisition retry interval", () => {
    const { jobs } = taskUnderTest(new FakeOfflineAuthorizationCodes());

    const schedules = jobs.crontab.map(scheduleOfCrontabLine);
    expect(schedules.map((schedule) => schedule.task)).toEqual([
      OFFLINE_AUTHORIZATION_CODE_TASK_IDENTIFIER,
    ]);
    expect(new Set(schedules[0]?.gapsMs)).toEqual(
      new Set([OFFLINE_AUTHORIZATION_CODE_ACQUISITION_RETRY_INTERVAL_MS]),
    );
  });

  it("requests the current fortnight's code through a client borrowed from the worker and keeps it", async () => {
    await seedOfflinePointOfSale(testDatabase.db);
    await issueWsaaToken();
    const taxAuthority = new FakeOfflineAuthorizationCodes();
    const { task } = taskUnderTest(taxAuthority);
    const { helpers, borrowClient } = buildJobHelpers();

    await task({}, helpers);

    expect(borrowClient).toHaveBeenCalledTimes(1);
    expect(taxAuthority.requests.map(({ fortnight }) => fortnight)).toEqual([OCTOBER_FIRST_HALF]);
    expect(await testDatabase.db.select().from(caeaCodes)).toEqual([
      {
        id: expect.any(String),
        fortnightStart: "2026-10-01",
        fortnightEnd: "2026-10-15",
        code: "36123456789012",
        reportDeadline: "2026-10-20",
        obtainedAt: NOW,
        obtainedThrough: "requested",
      },
    ]);
  });

  it("leaves the on-demand request out of the schedule", () => {
    const { jobs } = taskUnderTest(new FakeOfflineAuthorizationCodes());

    expect(jobs.crontab).not.toContain(
      expect.stringContaining(OFFLINE_AUTHORIZATION_CODE_REQUEST_TASK_IDENTIFIER),
    );
    expect(Object.keys(jobs.taskList)).toContain(
      OFFLINE_AUTHORIZATION_CODE_REQUEST_TASK_IDENTIFIER,
    );
  });
});

describe("the on-demand request for the current fortnight's offline authorization code", () => {
  function requestUnderTest(taxAuthority: TaxAuthorityOfflineAuthorizationCodes) {
    const jobs = offlineAuthorizationCodeJobs(
      { now: () => NOW, taxAuthority, certificateFingerprint: FINGERPRINT },
      { createDatabase: () => testDatabase.db, report: vi.fn() },
    );
    const task = jobs.taskList[OFFLINE_AUTHORIZATION_CODE_REQUEST_TASK_IDENTIFIER];
    if (!task) {
      throw new Error("test setup: expected the registered on-demand request task");
    }
    return task;
  }

  it("requests the current fortnight's code, keeps it and completes", async () => {
    await seedOfflinePointOfSale(testDatabase.db);
    await issueWsaaToken();
    const taxAuthority = new FakeOfflineAuthorizationCodes();
    const { helpers, borrowClient } = buildJobHelpers();

    await requestUnderTest(taxAuthority)({}, helpers);

    expect(borrowClient).toHaveBeenCalledTimes(1);
    expect(taxAuthority.requests.map(({ fortnight }) => fortnight)).toEqual([OCTOBER_FIRST_HALF]);
    expect(await testDatabase.db.select({ code: caeaCodes.code }).from(caeaCodes)).toEqual([
      { code: "36123456789012" },
    ]);
  });

  it("completes without asking the tax authority when the code is already held", async () => {
    await seedOfflinePointOfSale(testDatabase.db);
    await issueWsaaToken();
    const taxAuthority = new FakeOfflineAuthorizationCodes();
    const { helpers } = buildJobHelpers();
    await requestUnderTest(taxAuthority)({}, helpers);
    taxAuthority.requests.length = 0;

    await requestUnderTest(taxAuthority)({}, helpers);

    expect(taxAuthority.requests).toEqual([]);
  });

  it("fails while the current fortnight's code is still missing, so the worker retries with its backoff", async () => {
    await seedOfflinePointOfSale(testDatabase.db);
    await issueWsaaToken();
    const taxAuthority = new FakeOfflineAuthorizationCodes();
    taxAuthority.requestAnswer = { kind: "no_answer" };
    const { helpers } = buildJobHelpers();

    await expect(requestUnderTest(taxAuthority)({}, helpers)).rejects.toThrow(
      "the current fortnight's offline authorization code is still missing",
    );
  });

  it("fails while there is no valid token to ask with", async () => {
    await seedOfflinePointOfSale(testDatabase.db);
    const { helpers } = buildJobHelpers();

    await expect(
      requestUnderTest(new FakeOfflineAuthorizationCodes())({}, helpers),
    ).rejects.toThrow("still missing");
  });

  it("completes when no register has an offline point of sale, since there is nothing to obtain", async () => {
    const taxAuthority = new FakeOfflineAuthorizationCodes();
    const { helpers } = buildJobHelpers();

    await requestUnderTest(taxAuthority)({}, helpers);

    expect(taxAuthority.requests).toEqual([]);
  });
});

const FIRST_HALF_LINE =
  "offline authorization code acquisition for fortnight 2026-10-01..2026-10-15";
const SECOND_HALF_LINE =
  "offline authorization code acquisition for fortnight 2026-10-16..2026-10-31";

describe("the log of an offline authorization code acquisition run", () => {
  async function run(taxAuthority: TaxAuthorityOfflineAuthorizationCodes) {
    await seedOfflinePointOfSale(testDatabase.db);
    await issueWsaaToken();
    return runAgain(taxAuthority);
  }

  async function runAgain(taxAuthority: TaxAuthorityOfflineAuthorizationCodes) {
    const { task } = taskUnderTest(taxAuthority);
    const job = buildJobHelpers();
    await task({}, job.helpers);
    return job;
  }

  it("names the fortnight, the refusal and each rejection's code and message, and never the credentials", async () => {
    const taxAuthority = new FakeOfflineAuthorizationCodes();
    taxAuthority.requestAnswer = {
      kind: "refused",
      rejections: [
        { code: 15006, message: "Fictional rejection one" },
        { code: 15007, message: "Fictional rejection two" },
      ],
    };

    const { logs } = await run(taxAuthority);

    expect(logs).toEqual([
      {
        level: "info",
        message: `${FIRST_HALF_LINE}: refused (15006: Fictional rejection one; 15007: Fictional rejection two)`,
      },
    ]);
    expect(JSON.stringify(logs)).not.toMatch(/FICTIONAL-(TOKEN|SIGN)/);
  });

  it("names a request the tax authority did not answer", async () => {
    const taxAuthority = new FakeOfflineAuthorizationCodes();
    taxAuthority.requestAnswer = { kind: "no_answer" };

    const { logs } = await run(taxAuthority);

    expect(logs).toEqual([{ level: "info", message: `${FIRST_HALF_LINE}: no_answer` }]);
  });

  it("names a code that was obtained", async () => {
    const { logs } = await run(new FakeOfflineAuthorizationCodes());

    expect(logs).toEqual([{ level: "info", message: `${FIRST_HALF_LINE}: obtained` }]);
  });

  it("logs a fortnight whose code is already held at debug level only", async () => {
    const taxAuthority = new FakeOfflineAuthorizationCodes();
    await run(taxAuthority);

    const { logs } = await runAgain(taxAuthority);

    expect(logs).toEqual([{ level: "debug", message: `${FIRST_HALF_LINE}: held` }]);
  });

  it("logs a run with no offline point of sale at debug level only", async () => {
    const { task } = taskUnderTest(new FakeOfflineAuthorizationCodes());
    const { helpers, logs } = buildJobHelpers();

    await task({}, helpers);

    expect(logs.map(({ level }) => level)).toEqual(["debug"]);
  });
});

describe("the report of an offline authorization code acquisition failure", () => {
  const OCTOBER_13 = new Date("2026-10-13T15:00:00.000Z");
  const OCTOBER_12 = new Date("2026-10-12T15:00:00.000Z");
  const REJECTION = { code: 15006, message: "Fictional rejection" };

  async function holdFirstHalf() {
    await testDatabase.db.insert(caeaCodes).values({
      fortnightStart: "2026-10-01",
      fortnightEnd: "2026-10-15",
      code: "36123456789012",
      reportDeadline: "2026-10-20",
      obtainedAt: new Date("2026-09-28T12:00:00.000Z"),
      obtainedThrough: "requested",
    });
  }

  function taskAt(now: Date, taxAuthority: TaxAuthorityOfflineAuthorizationCodes) {
    const report = vi.fn();
    const jobs = offlineAuthorizationCodeJobs(
      { now: () => now, taxAuthority, certificateFingerprint: FINGERPRINT },
      { createDatabase: () => testDatabase.db, report },
    );
    const task = jobs.taskList[OFFLINE_AUTHORIZATION_CODE_TASK_IDENTIFIER];
    if (!task) {
      throw new Error("test setup: expected the registered offline authorization code task");
    }
    return { task, report };
  }

  async function setUp(now: Date, answer: OfflineAuthorizationCodeRequestAnswer) {
    await seedOfflinePointOfSale(testDatabase.db);
    await issueWsaaToken(now);
    await holdFirstHalf();
    const taxAuthority = new FakeOfflineAuthorizationCodes();
    taxAuthority.requestAnswer = answer;
    return taskAt(now, taxAuthority);
  }

  it("reaches the error reporter once across repeated runs, naming the fortnight, the outcome, the level and the rejections", async () => {
    const { task, report } = await setUp(OCTOBER_13, { kind: "refused", rejections: [REJECTION] });
    const { helpers } = buildJobHelpers();

    await task({}, helpers);
    await task({}, helpers);

    expect(report).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith(
      expect.any(String),
      new Error(`${SECOND_HALF_LINE}: refused (15006: Fictional rejection)`),
      {
        context: {
          fortnightStart: "2026-10-16",
          fortnightEnd: "2026-10-31",
          outcome: "refused",
          level: "warning",
          rejections: "15006: Fictional rejection",
        },
      },
    );
    expect(await testDatabase.db.select().from(offlineAuthorizationCodeAcquisitionReports)).toEqual(
      [{ fortnightStart: "2026-10-16", outcomeKind: "refused", reportedAt: OCTOBER_13 }],
    );
  });

  it("reports an unanswered request without rejections in its context", async () => {
    const { task, report } = await setUp(OCTOBER_13, { kind: "no_answer" });

    await task({}, buildJobHelpers().helpers);

    expect(report).toHaveBeenCalledWith(expect.any(String), expect.any(Error), {
      context: {
        fortnightStart: "2026-10-16",
        fortnightEnd: "2026-10-31",
        outcome: "no_answer",
        level: "warning",
      },
    });
  });

  it("does not report a failure while the fortnight's alert is only informational", async () => {
    const { task, report } = await setUp(OCTOBER_12, { kind: "no_answer" });

    await task({}, buildJobHelpers().helpers);

    expect(report).not.toHaveBeenCalled();
  });
});
