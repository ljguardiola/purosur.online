import type { SyncedFact } from "@purosur/domain/sync/use-cases";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import { insertOpenedSession } from "../register/sqlite-cash-ledger";
import { applyReplenishedClockCorrection } from "./replenished-clock-corrections";

type ClockCorrection = Extract<SyncedFact, { kind: "clock_corrected" }>;

let database: LocalDatabase;

const CORRECTION: ClockCorrection = {
  kind: "clock_corrected",
  correction: {
    registerId: "register-new",
    pointOfSale: 12,
    documentType: "factura_c",
    previousReading: new Date("2026-10-07T12:00:00.000Z"),
    correctedReading: new Date("2026-10-05T12:00:00.000Z"),
    actorId: "cashier-1",
  },
};

function clockMark(): string | undefined {
  return database.prepare<[], { reading: string }>("SELECT reading FROM register_clock_marks").get()
    ?.reading;
}

function corrections() {
  return database
    .prepare(
      `SELECT period, register_id, actor_id, point_of_sale, document_type, previous_reading, corrected_reading
         FROM clock_corrections ORDER BY id`,
    )
    .all();
}

function openSession(id: string): void {
  insertOpenedSession(database, {
    id,
    registerId: "register-new",
    deviceId: "device-old",
    openedBy: "cashier-1",
    openedAt: new Date("2026-10-07T08:00:00.000Z"),
    openingFloat: 0,
    state: "OPEN",
  });
}

beforeEach(() => {
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
  database
    .prepare(
      "INSERT INTO register_clock_marks (point_of_sale, document_type, reading) VALUES (12, 'factura_c', '2026-10-07T12:00:00.000Z')",
    )
    .run();
});

afterEach(() => {
  database.close();
});

describe("replenishing a clock correction into a restored register", () => {
  it("lowers the clock mark to the corrected reading", () => {
    applyReplenishedClockCorrection(database, CORRECTION);

    expect(clockMark()).toBe("2026-10-05T12:00:00.000Z");
  });

  it("records the correction, in the period of the cash session open when it was made", () => {
    openSession("session-1");

    applyReplenishedClockCorrection(database, CORRECTION);

    expect(corrections()).toEqual([
      {
        period: "session-1",
        register_id: "register-new",
        actor_id: "cashier-1",
        point_of_sale: 12,
        document_type: "factura_c",
        previous_reading: "2026-10-07T12:00:00.000Z",
        corrected_reading: "2026-10-05T12:00:00.000Z",
      },
    ]);
  });

  it("records the correction, with no session open, in the period after the last closed one", () => {
    applyReplenishedClockCorrection(database, CORRECTION);

    expect(corrections()).toMatchObject([{ period: "after session none" }]);
  });

  it("changes nothing when the snapshot already holds the correction", () => {
    applyReplenishedClockCorrection(database, CORRECTION);
    const before = { mark: clockMark(), corrections: corrections() };

    applyReplenishedClockCorrection(database, CORRECTION);

    expect({ mark: clockMark(), corrections: corrections() }).toEqual(before);
  });

  it("holds two corrections of the same register made one after another", () => {
    applyReplenishedClockCorrection(database, CORRECTION);
    applyReplenishedClockCorrection(database, {
      ...CORRECTION,
      correction: {
        ...CORRECTION.correction,
        previousReading: new Date("2026-10-05T18:00:00.000Z"),
        correctedReading: new Date("2026-10-04T18:00:00.000Z"),
      },
    });

    expect(corrections()).toHaveLength(2);
    expect(clockMark()).toBe("2026-10-04T18:00:00.000Z");
  });
});
