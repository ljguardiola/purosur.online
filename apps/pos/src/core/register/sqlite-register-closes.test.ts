import { beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import { SqliteRegisterCloses } from "./sqlite-register-closes";

let database: LocalDatabase;
let closes: SqliteRegisterCloses;

function closedSession(
  id: string,
  {
    registerId = "register-1",
    closedAt,
    countedCash,
  }: {
    registerId?: string;
    closedAt: string;
    countedCash: number;
  },
): void {
  database
    .prepare(
      `INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float,
         state, closed_by, closed_at, expected_cash, counted_cash, difference)
       VALUES (?, ?, 'device-1', 'u1', '2026-11-01T12:00:00.000Z', 0, 'CLOSED', 'u1', ?, ?, ?, 0)`,
    )
    .run(id, registerId, closedAt, countedCash, countedCash);
}

function openSession(id: string): void {
  database
    .prepare(
      `INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
       VALUES (?, 'register-1', 'device-1', 'u1', '2026-11-05T12:00:00.000Z', 0, 'OPEN')`,
    )
    .run(id);
}

beforeEach(() => {
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
  closes = new SqliteRegisterCloses(database);
});

describe("the latest close of each register", () => {
  it("is nothing when no session was closed", () => {
    openSession("open");

    expect(closes.latestCloseOfEachRegister()).toEqual([]);
  });

  it("is the last close recorded of each register, with when it closed and the cash counted", () => {
    closedSession("oldest", { closedAt: "2026-11-02T23:00:00.000Z", countedCash: 2_000_000 });
    closedSession("older", { closedAt: "2026-11-03T23:00:00.000Z", countedCash: 1_000_000 });
    closedSession("other", {
      registerId: "register-2",
      closedAt: "2026-11-01T23:00:00.000Z",
      countedCash: 5_000_000,
    });
    closedSession("newest", { closedAt: "2026-11-04T23:14:00.000Z", countedCash: 14_400_000 });
    openSession("open");

    expect(closes.latestCloseOfEachRegister()).toEqual(
      expect.arrayContaining([
        {
          registerId: "register-1",
          closedAt: new Date("2026-11-04T23:14:00.000Z"),
          countedCash: 14_400_000,
        },
        {
          registerId: "register-2",
          closedAt: new Date("2026-11-01T23:00:00.000Z"),
          countedCash: 5_000_000,
        },
      ]),
    );
    expect(closes.latestCloseOfEachRegister()).toHaveLength(2);
  });

  it("is the last close recorded even when the register's clock was set back before it", () => {
    closedSession("before the clock was set back", {
      closedAt: "2026-11-04T23:14:00.000Z",
      countedCash: 14_400_000,
    });
    closedSession("after the clock was set back", {
      closedAt: "2026-11-03T20:00:00.000Z",
      countedCash: 9_000_000,
    });

    expect(closes.latestCloseOfEachRegister()).toEqual([
      {
        registerId: "register-1",
        closedAt: new Date("2026-11-03T20:00:00.000Z"),
        countedCash: 9_000_000,
      },
    ]);
  });
});

describe("the register's identity", () => {
  it("is unknown before the register is enrolled", () => {
    expect(closes.registerIdentity()).toBeUndefined();
  });

  it("is the enrolled register and its device", () => {
    database
      .prepare(
        "INSERT INTO own_register (id, name, version, removed) VALUES ('register-1', 'Caja 1', 1, 0)",
      )
      .run();
    database.prepare("UPDATE sync_state SET device_id = 'device-1'").run();

    expect(closes.registerIdentity()).toEqual({ registerId: "register-1", deviceId: "device-1" });
  });
});
