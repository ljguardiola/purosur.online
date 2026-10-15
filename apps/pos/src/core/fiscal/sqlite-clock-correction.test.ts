import type { RoleAccess } from "@purosur/domain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import {
  SqliteClockCorrectionLedger,
  SqliteRegisterClockGuardReader,
} from "./sqlite-clock-correction";

const CHAIN_KEY = Buffer.from("0123456789abcdef0123456789abcdef").toString("base64");
const CORRECTOR: RoleAccess = {
  isAdministrator: false,
  permissionKeys: ["correct_register_clock"],
};
const people = {
  activePerson: (userId: string) =>
    userId === "u1" ? { firstName: "Ada", access: CORRECTOR } : undefined,
};

let database: LocalDatabase;

function ledger(chainKey: string | undefined = CHAIN_KEY) {
  return new SqliteClockCorrectionLedger(database, people, chainKey);
}

function reader() {
  return new SqliteRegisterClockGuardReader(database, people);
}

function setMark(pointOfSale: number, reading: string) {
  database
    .prepare(
      "INSERT INTO register_clock_marks (point_of_sale, document_type, reading) VALUES (?, 'factura_c', ?)",
    )
    .run(pointOfSale, reading);
}

function openSession(id: string, state: "OPEN" | "CLOSED", closedAt: string | null = null) {
  database
    .prepare(
      `INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, closed_at, state)
       VALUES (?, 'r1', 'device-1', 'u1', '2026-10-01T09:00:00.000Z', 0, ?, ?)`,
    )
    .run(id, closedAt, state);
}

function setPointOfSale(day: string | null) {
  database
    .prepare(
      `INSERT INTO register_point_of_sale (
         register_id, point_of_sale_number, fiscal_address_id, tax_authority_last_authorized_number,
         tax_authority_last_authorized_issued_on, version
       ) VALUES ('r1', 12, 'address-1', 40, ?, 1)`,
    )
    .run(day);
}

function registerOwnRegister(removed = 0) {
  database
    .prepare("INSERT INTO own_register (id, name, version, removed) VALUES ('r1', 'Caja 1', 1, ?)")
    .run(removed);
}

beforeEach(() => {
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
  database.prepare("UPDATE sync_state SET device_id = 'device-1'").run();
});

afterEach(() => {
  database.close();
});

describe("the register's clock marks, read for its guard", () => {
  it("holds none on a fresh register", () => {
    expect(ledger().transaction((tx) => tx.clockMarks())).toEqual([]);
  });

  it("lists every mark with its point of sale, document type and reading", () => {
    setMark(12, "2026-10-01T16:00:00.000Z");
    setMark(31, "2026-10-01T15:30:00.000Z");

    expect(ledger().transaction((tx) => tx.clockMarks())).toEqual([
      { pointOfSale: 12, documentType: "factura_c", reading: new Date("2026-10-01T16:00:00.000Z") },
      { pointOfSale: 31, documentType: "factura_c", reading: new Date("2026-10-01T15:30:00.000Z") },
    ]);
    expect(reader().clockMarks()).toEqual(ledger().transaction((tx) => tx.clockMarks()));
  });

  it("answers the access of an active person, and none for another", () => {
    expect(ledger().transaction((tx) => tx.correctorAccess("u1"))).toEqual(CORRECTOR);
    expect(ledger().transaction((tx) => tx.correctorAccess("u2"))).toBeUndefined();
    expect(reader().correctorAccess("u1")).toEqual(CORRECTOR);
  });
});

describe("the register of the clock marks", () => {
  it("is the own register, none once removed or before it is pulled", () => {
    expect(ledger().transaction((tx) => tx.registerId())).toBeUndefined();

    registerOwnRegister(1);
    expect(ledger().transaction((tx) => tx.registerId())).toBeUndefined();

    database.prepare("UPDATE own_register SET removed = 0").run();
    expect(ledger().transaction((tx) => tx.registerId())).toBe("r1");
  });
});

describe("the tax authority's last authorized day, read as the guard's floor", () => {
  it("is none before the register has a point of sale", () => {
    expect(reader().taxAuthorityFloor()).toBeNull();
  });

  it("is none while the day was not pulled", () => {
    registerOwnRegister();
    setPointOfSale(null);

    expect(reader().taxAuthorityFloor()).toBeNull();
  });

  it("is the day of the register's real-time point of sale", () => {
    registerOwnRegister();
    setPointOfSale("2026-10-01");

    expect(reader().taxAuthorityFloor()).toEqual({
      pointOfSale: 12,
      documentType: "factura_c",
      lastIssuedOn: "2026-10-01",
    });
  });

  it("is none for a removed register", () => {
    registerOwnRegister(1);
    setPointOfSale("2026-10-01");

    expect(reader().taxAuthorityFloor()).toBeNull();
  });
});

describe("the cash session standing", () => {
  it("is none open and none closed on a register that never opened a session", () => {
    expect(ledger().transaction((tx) => tx.cashSessionStanding())).toEqual({
      openSessionId: null,
      lastClosedSessionId: null,
    });
  });

  it("is the open session and the one closed last", () => {
    openSession("s1", "CLOSED", "2026-10-01T10:00:00.000Z");
    openSession("s3", "CLOSED", "2026-10-02T10:00:00.000Z");
    openSession("s2", "CLOSED", "2026-10-01T18:00:00.000Z");
    openSession("s4", "OPEN");

    const expected = { openSessionId: "s4", lastClosedSessionId: "s3" };
    expect(ledger().transaction((tx) => tx.cashSessionStanding())).toEqual(expected);
    expect(reader().cashSessionStanding()).toEqual(expected);
  });

  it("is the last session closed when none is open", () => {
    openSession("s1", "CLOSED", "2026-10-01T10:00:00.000Z");

    expect(reader().cashSessionStanding()).toEqual({
      openSessionId: null,
      lastClosedSessionId: "s1",
    });
  });
});

describe("lowering a clock mark and recording the correction", () => {
  const LOWERING = {
    pointOfSale: 12,
    documentType: "factura_c",
    previousReading: new Date("2026-10-01T16:00:00.000Z"),
    correctedReading: new Date("2026-10-01T15:00:00.000Z"),
  } as const;

  function correct() {
    ledger().transaction((tx) => {
      tx.lowerClockMark(LOWERING);
      tx.recordClockCorrection({
        period: "s1",
        registerId: "r1",
        actorId: "u1",
        lowering: LOWERING,
      });
    });
  }

  it("sets the mark of the point of sale to the corrected reading, leaving the others", () => {
    setMark(12, "2026-10-01T16:00:00.000Z");
    setMark(31, "2026-10-01T16:30:00.000Z");

    correct();

    expect(
      database.prepare("SELECT point_of_sale, reading FROM register_clock_marks ORDER BY 1").all(),
    ).toEqual([
      { point_of_sale: 12, reading: "2026-10-01T15:00:00.000Z" },
      { point_of_sale: 31, reading: "2026-10-01T16:30:00.000Z" },
    ]);
  });

  it("records who corrected which point of sale from which reading to which, in which period", () => {
    setMark(12, "2026-10-01T16:00:00.000Z");

    correct();

    expect(
      database
        .prepare(
          `SELECT period, register_id, actor_id, point_of_sale, document_type, previous_reading, corrected_reading
           FROM clock_corrections`,
        )
        .all(),
    ).toEqual([
      {
        period: "s1",
        register_id: "r1",
        actor_id: "u1",
        point_of_sale: 12,
        document_type: "factura_c",
        previous_reading: "2026-10-01T16:00:00.000Z",
        corrected_reading: "2026-10-01T15:00:00.000Z",
      },
    ]);
  });

  it("makes a period one with a correction recorded in it, whichever the point of sale", () => {
    setMark(12, "2026-10-01T16:00:00.000Z");

    expect(ledger().transaction((tx) => tx.clockCorrectionRecordedIn("s1"))).toBe(false);
    correct();

    expect(ledger().transaction((tx) => tx.clockCorrectionRecordedIn("s1"))).toBe(true);
    expect(reader().clockCorrectionRecordedIn("s1")).toBe(true);
    expect(reader().clockCorrectionRecordedIn("s2")).toBe(false);
    expect(reader().clockCorrectionRecordedIn("after session s1")).toBe(false);
  });

  it("appends the event to the outbox in the same transaction", () => {
    ledger().transaction((tx) =>
      tx.appendOutboxEvent({
        event_id: "event-1",
        aggregate_type: "CashRegister",
        aggregate_id: "r1",
        event_type: "clock_corrected",
        schema_version: 1,
        payload: { point_of_sale: 12 },
        occurred_at: "2026-10-01T15:00:00.000Z",
        actor_id: "u1",
      }),
    );

    expect(database.prepare("SELECT event_type, aggregate_id, actor_id FROM outbox").all()).toEqual(
      [{ event_type: "clock_corrected", aggregate_id: "r1", actor_id: "u1" }],
    );
  });

  it("changes nothing when the transaction fails", () => {
    setMark(12, "2026-10-01T16:00:00.000Z");

    expect(() =>
      ledger().transaction((tx) => {
        tx.lowerClockMark(LOWERING);
        throw new Error("interrupted");
      }),
    ).toThrow("interrupted");

    expect(database.prepare("SELECT reading FROM register_clock_marks").all()).toEqual([
      { reading: "2026-10-01T16:00:00.000Z" },
    ]);
  });

  it("refuses to append an event while the register has no outbox chain key", () => {
    expect(() =>
      ledger(undefined).transaction((tx) =>
        tx.appendOutboxEvent({
          event_id: "event-1",
          aggregate_type: "CashRegister",
          aggregate_id: "r1",
          event_type: "clock_corrected",
          schema_version: 1,
          payload: {},
          occurred_at: "2026-10-01T15:00:00.000Z",
          actor_id: "u1",
        }),
      ),
    ).toThrow(/outbox chain key/);
  });
});
