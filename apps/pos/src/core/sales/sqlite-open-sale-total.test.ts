import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import { openSaleTotalOf } from "./sqlite-open-sale-total";

let database: LocalDatabase;

function addSale(id: string, state: string, lineTotals: number[], sessionId = "session-1"): void {
  database
    .prepare(
      `INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at, voided_at)
       VALUES (?, 'r1', 'device-1', ?, 'u1', ?, ?, ?)`,
    )
    .run(
      id,
      sessionId,
      state,
      state === "OPEN" ? null : "2026-10-08T12:00:00.000Z",
      state === "VOIDED" ? "2026-10-08T12:30:00.000Z" : null,
    );
  lineTotals.forEach((lineTotal, index) => {
    database
      .prepare(
        `INSERT INTO sale_lines (id, sale_id, position, product_id, product_name, quantity, list_unit_price, price_list_id, line_total)
         VALUES (?, ?, ?, ?, 'Yerba', 1, ?, 'pl-1', ?)`,
      )
      .run(`${id}-line-${index}`, id, index + 1, `p${index}${id}`, lineTotal, lineTotal);
  });
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

describe("openSaleTotalOf", () => {
  it("is none while the session has no sale", () => {
    expect(openSaleTotalOf(database, "session-1")).toBeUndefined();
  });

  it("is none while the session only has sales that are over", () => {
    addSale("sale-1", "COMPLETED", [1500]);
    addSale("sale-2", "VOIDED", [700]);

    expect(openSaleTotalOf(database, "session-1")).toBeUndefined();
  });

  it("adds up the lines of the sale in progress", () => {
    addSale("sale-1", "COMPLETED", [999]);
    addSale("sale-2", "OPEN", [1500, 250]);

    expect(openSaleTotalOf(database, "session-1")).toBe(1750);
  });

  it("is zero for a sale in progress whose lines were all removed", () => {
    addSale("sale-1", "OPEN", []);

    expect(openSaleTotalOf(database, "session-1")).toBe(0);
  });

  it("is none for a session whose sale is not the one in progress", () => {
    addSale("sale-1", "OPEN", [1500]);

    expect(openSaleTotalOf(database, "session-2")).toBeUndefined();
  });

  it("takes the discount on the sale's total off the lines", () => {
    addSale("sale-1", "OPEN", [1250, 3000]);
    database
      .prepare(
        `UPDATE sales SET sale_discount_kind = 'AMOUNT', sale_discount_value = 250,
           sale_discount_reason = 'regalo' WHERE id = 'sale-1'`,
      )
      .run();

    expect(openSaleTotalOf(database, "session-1")).toBe(4000);
  });
});
