import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import { SqliteRegisterCashSession } from "./sqlite-register-cash-session";

let database: LocalDatabase;

beforeEach(() => {
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
  database.exec(
    `INSERT INTO own_register (id, name, version) VALUES ('r1', 'Caja 1', 1);
     UPDATE sync_state SET device_id = 'device-1';
     INSERT INTO roles (id, name, is_administrator, version) VALUES ('cashier', 'Cajera', 0, 1);
     INSERT INTO users (id, first_name, role_id, salt, active, version) VALUES ('u1', 'Marta', 'cashier', 's', 1, 1);
     INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state, closed_at)
     VALUES ('open-session', 'r1', 'device-1', 'u1', '2026-10-08T08:00:00.000Z', 0, 'OPEN', NULL);`,
  );
});

afterEach(() => {
  database.close();
});

describe("SqliteRegisterCashSession", () => {
  it("says the register's cash session is open while one is open", () => {
    expect(new SqliteRegisterCashSession(database).isOpen()).toBe(true);
  });

  it("says the register's cash session is not open once the open session closes", () => {
    database.exec(
      "UPDATE cash_sessions SET state = 'CLOSED', closed_at = '2026-10-08T20:00:00.000Z' WHERE id = 'open-session'",
    );

    expect(new SqliteRegisterCashSession(database).isOpen()).toBe(false);
  });
});
