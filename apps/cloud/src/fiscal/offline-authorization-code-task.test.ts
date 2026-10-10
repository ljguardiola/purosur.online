import type {
  OfflineAuthorizationCodeCall,
  OfflineAuthorizationCodeLookupAnswer,
  OfflineAuthorizationCodeRequestAnswer,
  TaxAuthorityOfflineAuthorizationCodes,
} from "@purosur/domain/fiscal/use-cases";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { arcaWsaaTokens, caeaCodes } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { buildJobHelpers } from "../test-support/job-helpers.js";
import {
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

function taskUnderTest(taxAuthority: TaxAuthorityOfflineAuthorizationCodes) {
  const jobs = offlineAuthorizationCodeJobs(
    { now: () => NOW, taxAuthority, certificateFingerprint: FINGERPRINT },
    { createDatabase: () => testDatabase.db },
  );
  const task = jobs.taskList[OFFLINE_AUTHORIZATION_CODE_TASK_IDENTIFIER];
  if (!task) {
    throw new Error("test setup: expected the registered offline authorization code task");
  }
  return { jobs, task };
}

describe("offlineAuthorizationCodeJobs", () => {
  it("registers the acquisition task and schedules it every ten minutes", () => {
    const { jobs } = taskUnderTest(new FakeOfflineAuthorizationCodes());

    expect(jobs.crontab).toEqual(["*/10 * * * * offline-authorization-code-acquisition"]);
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
        fortnightStart: "2026-10-01",
        fortnightEnd: "2026-10-15",
        code: "36123456789012",
        reportDeadline: "2026-10-20",
        obtainedAt: NOW,
        obtainedThrough: "requested",
      },
    ]);
  });

  it("asks ARCA nothing while no register has an offline point of sale", async () => {
    await issueWsaaToken();
    const taxAuthority = new FakeOfflineAuthorizationCodes();
    const { task } = taskUnderTest(taxAuthority);

    await task({}, buildJobHelpers().helpers);

    expect(taxAuthority.requests).toEqual([]);
    expect(await testDatabase.db.select().from(caeaCodes)).toEqual([]);
  });

  it("finishes without a code when ARCA gives no answer, leaving it to the next run", async () => {
    await seedOfflinePointOfSale(testDatabase.db);
    await issueWsaaToken();
    const taxAuthority = new FakeOfflineAuthorizationCodes();
    taxAuthority.requestAnswer = { kind: "no_answer" };
    const { task } = taskUnderTest(taxAuthority);

    await expect(task({}, buildJobHelpers().helpers)).resolves.toBeUndefined();

    expect(await testDatabase.db.select().from(caeaCodes)).toEqual([]);
  });

  it("finishes without a code when ARCA refuses the request, leaving it to the next run", async () => {
    await seedOfflinePointOfSale(testDatabase.db);
    await issueWsaaToken();
    const taxAuthority = new FakeOfflineAuthorizationCodes();
    taxAuthority.requestAnswer = { kind: "refused", rejections: [{ code: 1, message: "No" }] };
    const { task } = taskUnderTest(taxAuthority);

    await expect(task({}, buildJobHelpers().helpers)).resolves.toBeUndefined();

    expect(await testDatabase.db.select().from(caeaCodes)).toEqual([]);
  });

  it("finishes without asking ARCA when the cloud holds no valid WSAA token", async () => {
    await seedOfflinePointOfSale(testDatabase.db);
    const taxAuthority = new FakeOfflineAuthorizationCodes();
    const { task } = taskUnderTest(taxAuthority);

    await expect(task({}, buildJobHelpers().helpers)).resolves.toBeUndefined();

    expect(taxAuthority.requests).toEqual([]);
  });
});
