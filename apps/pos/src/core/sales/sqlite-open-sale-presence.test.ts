import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import { anySaleIsOpen } from "./sqlite-open-sale-presence";

let database: LocalDatabase;

function addSale(id: string, state: string): void {
  database
    .prepare(
      `INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at)
       VALUES (?, 'r1', 'device-1', 'session-1', 'u1', ?, '2026-10-08T12:00:00.000Z')`,
    )
    .run(id, state);
}

beforeEach(() => {
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
  database.exec(
    `INSERT INTO own_register (id, name, version) VALUES ('r1', 'Caja 1', 1);
     UPDATE sync_state SET device_id = 'device-1';
     INSERT INTO roles (id, name, is_administrator, version) VALUES ('cashier', 'Cajera', 0, 1);
     INSERT INTO users (id, first_name, role_id, salt, active, version) VALUES ('u1', 'Marta', 'cashier', 's', 1, 1);
     INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state, closed_at)
     VALUES ('session-1', 'r1', 'device-1', 'u1', '2026-10-08T08:00:00.000Z', 0, 'OPEN', NULL);`,
  );
});

afterEach(() => {
  database.close();
});

describe("anySaleIsOpen", () => {
  it("is false when there are no sales", () => {
    expect(anySaleIsOpen(database)).toBe(false);
  });

  it("is false when every sale is completed", () => {
    addSale("done", "COMPLETED");

    expect(anySaleIsOpen(database)).toBe(false);
  });

  it("is true when a sale is open", () => {
    addSale("done", "COMPLETED");
    addSale("being-rung", "OPEN");

    expect(anySaleIsOpen(database)).toBe(true);
  });
});
