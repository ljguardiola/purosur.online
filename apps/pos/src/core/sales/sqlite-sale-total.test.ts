import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openFiscalDatabase } from "../fiscal/test-support/real-time-authorization-database";
import type { LocalDatabase } from "../platform/local-database";
import { saleTotalOf } from "./sqlite-sale-total";

let database: LocalDatabase;

function addSale(id: string, lineTotals: number[]): void {
  database
    .prepare(
      `INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at)
       VALUES (?, 'register-1', 'device-a', 'session-1', 'u1', 'COMPLETED', '2026-09-30T12:05:00.000Z')`,
    )
    .run(id);
  lineTotals.forEach((lineTotal, index) => {
    database
      .prepare(
        `INSERT INTO sale_lines (id, sale_id, position, product_id, product_name, quantity, list_unit_price, price_list_id, discount_amount, line_total)
         VALUES (?, ?, ?, ?, 'Producto', 1, ?, 'list-1', 0, ?)`,
      )
      .run(`${id}-line-${index}`, id, index + 1, `p-${index}`, lineTotal, lineTotal);
  });
}

beforeEach(() => {
  database = openFiscalDatabase();
});

afterEach(() => {
  database.close();
});

describe("saleTotalOf", () => {
  it("adds up the totals of the sale's lines", () => {
    addSale("sale-1", [1000, 2500]);

    expect(saleTotalOf(database, "sale-1")).toBe(3500);
  });

  it("takes the sale's percentage discount off the lines", () => {
    addSale("sale-1", [1000, 1000]);
    database
      .prepare(
        `UPDATE sales SET sale_discount_kind = 'PERCENT', sale_discount_value = 10,
           sale_discount_reason = 'cliente frecuente' WHERE id = 'sale-1'`,
      )
      .run();

    expect(saleTotalOf(database, "sale-1")).toBe(1800);
  });

  it("takes the sale's amount discount off the lines", () => {
    addSale("sale-1", [1000, 1000]);
    database
      .prepare(
        `UPDATE sales SET sale_discount_kind = 'AMOUNT', sale_discount_value = 300,
           sale_discount_reason = 'cliente frecuente' WHERE id = 'sale-1'`,
      )
      .run();

    expect(saleTotalOf(database, "sale-1")).toBe(1700);
  });

  it("is nothing for a sale with no lines", () => {
    addSale("sale-1", []);

    expect(saleTotalOf(database, "sale-1")).toBe(0);
  });
});
