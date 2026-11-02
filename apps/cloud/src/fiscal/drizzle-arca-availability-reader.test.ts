import { ARCA_REACHABILITY_HORIZON_MS, type ArcaAvailabilityRun } from "@purosur/domain";
import {
  type ArcaAvailabilityReader,
  readExceptionShareYear,
} from "@purosur/domain/fiscal/use-cases";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { arcaVitalityChecks } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { fixedZoneRulesSource } from "../test-support/fixed-zone-rules-source.js";
import { DrizzleArcaAvailabilityReader } from "./drizzle-arca-availability-reader.js";

const SECOND = 1_000;
const MONTH_START = new Date("2026-10-01T03:00:00.000Z");
const PERIOD = { from: MONTH_START, to: new Date("2026-11-01T03:00:00.000Z") };

let testDatabase: TestDatabase;
let db: TestDatabase["db"];

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
});

function second(offset: number): Date {
  return new Date(MONTH_START.getTime() + offset * SECOND);
}

async function probe(offset: number, ok: boolean) {
  await db.insert(arcaVitalityChecks).values({ checkedAt: second(offset), ok });
}

function read(period = PERIOD) {
  return new DrizzleArcaAvailabilityReader(db).availabilityRuns(period);
}

async function availableTimeOfTheMonth(availability: ArcaAvailabilityReader) {
  const outcome = await readExceptionShareYear(
    {
      reader: {
        fiscalAddress: async (id) => ({ id, name: "Depósito Central" }),
        monthlyVoucherCounts: async () => [],
        recordedBreachMonths: async () => [],
      },
      availability,
      contingency: {
        contingencyIntervalsAtFiscalAddress: async () => ({ parts: [], registers: [] }),
      },
      clock: { now: () => PERIOD.to },
      zoneRules: fixedZoneRulesSource(),
    },
    { fiscalAddressId: "fiscal-address", year: 2026 },
  );
  if (outcome.kind !== "read") {
    throw new Error("test setup: the fiscal address was not found");
  }
  return outcome.months.find(({ month }) => month === "2026-10")?.contingencyTime.availableMs;
}

describe("DrizzleArcaAvailabilityReader", () => {
  it("answers nothing when no probe was recorded", async () => {
    expect(await read()).toEqual([]);
  });

  it("answers a run of consecutive probes with the same answer as its first and last probe", async () => {
    for (const offset of [0, 30, 60, 90, 120]) {
      await probe(offset, true);
    }

    expect(await read()).toEqual([
      { ok: true, firstCheckedAt: second(0), lastCheckedAt: second(120) },
    ]);
  });

  it("starts a new run when the answer changes", async () => {
    await probe(0, true);
    await probe(30, true);
    await probe(60, false);
    await probe(90, false);
    await probe(120, true);

    expect(await read()).toEqual([
      { ok: true, firstCheckedAt: second(0), lastCheckedAt: second(30) },
      { ok: false, firstCheckedAt: second(60), lastCheckedAt: second(90) },
      { ok: true, firstCheckedAt: second(120), lastCheckedAt: second(120) },
    ]);
  });

  it("starts a new run when two probes are further apart than the horizon, keeping them together at exactly the horizon", async () => {
    const horizonSeconds = ARCA_REACHABILITY_HORIZON_MS / SECOND;
    await probe(0, true);
    await probe(horizonSeconds, true);
    await probe(horizonSeconds * 2 + 1, true);

    expect(await read()).toEqual([
      { ok: true, firstCheckedAt: second(0), lastCheckedAt: second(horizonSeconds) },
      {
        ok: true,
        firstCheckedAt: second(horizonSeconds * 2 + 1),
        lastCheckedAt: second(horizonSeconds * 2 + 1),
      },
    ]);
  });

  it("includes the probe just before the period, whose answer may still hold into it, and no older one", async () => {
    await probe(-ARCA_REACHABILITY_HORIZON_MS / SECOND - 1, true);
    await probe(-ARCA_REACHABILITY_HORIZON_MS / SECOND, true);
    await probe(0, true);

    expect(await read()).toEqual([
      {
        ok: true,
        firstCheckedAt: second(-ARCA_REACHABILITY_HORIZON_MS / SECOND),
        lastCheckedAt: second(0),
      },
    ]);
  });

  it("leaves out the probes from the end of the period on", async () => {
    await probe(30, true);
    await probe((PERIOD.to.getTime() - MONTH_START.getTime()) / SECOND, true);

    expect(await read()).toEqual([
      { ok: true, firstCheckedAt: second(30), lastCheckedAt: second(30) },
    ]);
  });

  it("loses nothing: the available time of the runs equals that of every probe", async () => {
    let seed = 7;
    const next = (bound: number) => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed % bound;
    };
    const everyProbe: { checkedAt: Date; ok: boolean }[] = [];
    let offset = 0;
    let ok = true;
    while (offset < 3 * 24 * 3_600) {
      if (next(40) === 0) {
        ok = !ok;
      }
      everyProbe.push({ checkedAt: second(offset), ok });
      offset += next(25) === 0 ? 60 + next(600) : 30;
    }
    await db.insert(arcaVitalityChecks).values(everyProbe);

    const runOfEveryProbe: ArcaAvailabilityRun[] = everyProbe.map(({ checkedAt, ok: answer }) => ({
      ok: answer,
      firstCheckedAt: checkedAt,
      lastCheckedAt: checkedAt,
    }));

    expect((await read()).length).toBeLessThan(everyProbe.length);
    expect(await availableTimeOfTheMonth(new DrizzleArcaAvailabilityReader(db))).toBe(
      await availableTimeOfTheMonth({ availabilityRuns: async () => runOfEveryProbe }),
    );
  });
});
