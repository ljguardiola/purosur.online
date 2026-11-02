import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  registerContingencyIntervals,
  registerContingencyReporting,
} from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import {
  recordAppliedContingencyEntered,
  recordAppliedContingencyLeft,
  recordAppliedContingencyReportingStarted,
} from "./drizzle-applied-register-contingency.js";
import {
  insertFiscalAddress,
  insertRegisterAtFiscalAddress,
} from "./test-support/exception-share-fixtures.js";

const INTERVAL = "01a1414f-0002-7c2d-9e3f-5a6b7c8d9e02";
const STARTED = new Date("2026-10-06T11:00:00.000Z");
const ENDED = new Date("2026-10-06T11:40:00.000Z");

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let registerId: string;

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
  const fiscalAddressId = await insertFiscalAddress(db, "Depósito Central");
  registerId = await insertRegisterAtFiscalAddress(db, fiscalAddressId, "Caja 1");
});

const entered = { intervalId: INTERVAL, startedAt: STARTED };
const left = { intervalId: INTERVAL, startedAt: STARTED, endedAt: ENDED };

const intervals = () => db.select().from(registerContingencyIntervals);

describe("recording the contingency intervals of applied events", () => {
  it("keeps an interval that was entered as open, at the register that entered it", async () => {
    await recordAppliedContingencyEntered(db, { registerId }, entered);

    expect(await intervals()).toEqual([
      { intervalId: INTERVAL, registerId, startedAt: STARTED, endedAt: null },
    ]);
  });

  it("keeps one interval when the same entry is delivered again", async () => {
    await recordAppliedContingencyEntered(db, { registerId }, entered);
    await recordAppliedContingencyEntered(db, { registerId }, entered);

    expect(await intervals()).toHaveLength(1);
  });

  it("ends the open interval when its exit arrives", async () => {
    await recordAppliedContingencyEntered(db, { registerId }, entered);

    await recordAppliedContingencyLeft(db, { registerId }, left);

    expect(await intervals()).toEqual([
      { intervalId: INTERVAL, registerId, startedAt: STARTED, endedAt: ENDED },
    ]);
  });

  it("keeps one closed interval when the exit arrives before the entry", async () => {
    await recordAppliedContingencyLeft(db, { registerId }, left);
    await recordAppliedContingencyEntered(db, { registerId }, entered);

    expect(await intervals()).toEqual([
      { intervalId: INTERVAL, registerId, startedAt: STARTED, endedAt: ENDED },
    ]);
  });

  it("keeps one closed interval when the exit is delivered twice", async () => {
    await recordAppliedContingencyEntered(db, { registerId }, entered);
    await recordAppliedContingencyLeft(db, { registerId }, left);
    await recordAppliedContingencyLeft(db, { registerId }, left);

    expect(await intervals()).toEqual([
      { intervalId: INTERVAL, registerId, startedAt: STARTED, endedAt: ENDED },
    ]);
  });

  it("keeps the end it first received when a later exit says another one", async () => {
    await recordAppliedContingencyLeft(db, { registerId }, left);

    await recordAppliedContingencyLeft(
      db,
      { registerId },
      {
        ...left,
        endedAt: new Date("2026-10-06T12:00:00.000Z"),
      },
    );

    expect(await intervals()).toEqual([expect.objectContaining({ endedAt: ENDED })]);
  });

  it("keeps an interval still open while another of the same register ended", async () => {
    await recordAppliedContingencyEntered(db, { registerId }, entered);
    await recordAppliedContingencyLeft(db, { registerId }, left);
    await recordAppliedContingencyEntered(
      db,
      { registerId },
      {
        intervalId: "01a1414f-0009-7c2d-9e3f-5a6b7c8d9e09",
        startedAt: new Date("2026-10-06T13:00:00.000Z"),
      },
    );

    const rows = await intervals();

    expect(rows.map(({ endedAt }) => endedAt).sort()).toEqual([ENDED, null].sort());
    expect(rows).toHaveLength(2);
  });

  it("keeps the moment a register started reporting contingency, the first one received", async () => {
    await recordAppliedContingencyReportingStarted(db, { registerId }, { since: STARTED });

    await recordAppliedContingencyReportingStarted(
      db,
      { registerId },
      {
        since: new Date("2026-10-07T08:00:00.000Z"),
      },
    );

    expect(await db.select().from(registerContingencyReporting)).toEqual([
      { registerId, since: STARTED },
    ]);
  });
});
