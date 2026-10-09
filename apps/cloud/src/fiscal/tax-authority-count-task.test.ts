import type {
  LastAuthorizedAnswer,
  TaxAuthorityLastAuthorizedLookup,
} from "@purosur/domain/fiscal/use-cases";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { arcaWsaaTokens, taxAuthorityLastAuthorizedNumbers } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { buildJobHelpers } from "../test-support/job-helpers.js";
import {
  TAX_AUTHORITY_COUNT_TASK_IDENTIFIER,
  taxAuthorityCountJobs,
} from "./tax-authority-count-task.js";

const NOW = new Date("2026-10-06T15:00:00.000Z");
const FINGERPRINT = "AB:CD:EF";

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

class FakeLastAuthorizedLookup implements TaxAuthorityLastAuthorizedLookup {
  readonly lookups: number[] = [];
  answer: LastAuthorizedAnswer = { kind: "read", number: 41 };

  async lastAuthorized({ pointOfSale }: { pointOfSale: number }) {
    this.lookups.push(pointOfSale);
    return this.answer;
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

function taskUnderTest(taxAuthority: TaxAuthorityLastAuthorizedLookup) {
  const jobs = taxAuthorityCountJobs(
    { now: () => NOW, taxAuthority, certificateFingerprint: FINGERPRINT },
    { createDatabase: () => testDatabase.db },
  );
  const task = jobs.taskList[TAX_AUTHORITY_COUNT_TASK_IDENTIFIER];
  if (!task) {
    throw new Error("test setup: expected the registered count task");
  }
  return { jobs, task };
}

async function storedCounts() {
  return testDatabase.db.select().from(taxAuthorityLastAuthorizedNumbers);
}

describe("taxAuthorityCountJobs", () => {
  it("registers the count task and schedules nothing, since it runs when a point of sale is configured", () => {
    const { jobs } = taskUnderTest(new FakeLastAuthorizedLookup());

    expect(jobs.crontab).toEqual([]);
  });

  it("reads the last authorized number of the payload's point of sale and keeps it", async () => {
    await issueWsaaToken();
    const taxAuthority = new FakeLastAuthorizedLookup();
    const { task } = taskUnderTest(taxAuthority);
    const { helpers, borrowClient } = buildJobHelpers();

    await task({ pointOfSale: 7 }, helpers);

    expect(taxAuthority.lookups).toEqual([7]);
    expect(borrowClient).toHaveBeenCalledTimes(1);
    expect(await storedCounts()).toEqual([
      { pointOfSaleNumber: 7, lastAuthorized: 41, readAt: NOW },
    ]);
  });

  it("fails when the cloud holds no valid WSAA token, so the worker retries it", async () => {
    const taxAuthority = new FakeLastAuthorizedLookup();
    const { task } = taskUnderTest(taxAuthority);

    await expect(task({ pointOfSale: 7 }, buildJobHelpers().helpers)).rejects.toThrow();

    expect(taxAuthority.lookups).toEqual([]);
    expect(await storedCounts()).toEqual([]);
  });

  it("fails when the tax authority gives no answer, so the worker retries it", async () => {
    await issueWsaaToken();
    const taxAuthority = new FakeLastAuthorizedLookup();
    taxAuthority.answer = { kind: "no_answer" };
    const { task } = taskUnderTest(taxAuthority);

    await expect(task({ pointOfSale: 7 }, buildJobHelpers().helpers)).rejects.toThrow();

    expect(await storedCounts()).toEqual([]);
  });

  it.each([{}, { pointOfSale: "7" }, { pointOfSale: 0 }, null])(
    "fails a job whose payload names no point of sale (%j), asking the tax authority nothing",
    async (payload) => {
      await issueWsaaToken();
      const taxAuthority = new FakeLastAuthorizedLookup();
      const { task } = taskUnderTest(taxAuthority);

      await expect(task(payload, buildJobHelpers().helpers)).rejects.toThrow();

      expect(taxAuthority.lookups).toEqual([]);
    },
  );
});
