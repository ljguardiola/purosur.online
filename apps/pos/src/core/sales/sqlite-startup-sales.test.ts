import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openFiscalDatabase } from "../fiscal/test-support/real-time-authorization-database";
import type { LocalDatabase } from "../platform/local-database";
import { SqliteStartupSales } from "./sqlite-startup-sales";

let database: LocalDatabase;

function addSale({
  id,
  session = "session-1",
  state = "COMPLETED",
  occurredAt = "2026-09-30T12:05:00.000Z",
  printAttemptedAt = null,
  printedAt = null,
  lineTotal = 1000,
}: {
  id: string;
  session?: string;
  state?: string;
  occurredAt?: string | null;
  printAttemptedAt?: string | null;
  printedAt?: string | null;
  lineTotal?: number;
}): void {
  database
    .prepare(
      `INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at, print_attempted_at, printed_at)
       VALUES (?, 'register-1', 'device-a', ?, 'u1', ?, ?, ?, ?)`,
    )
    .run(id, session, state, occurredAt, printAttemptedAt, printedAt);
  database
    .prepare(
      `INSERT INTO sale_lines (id, sale_id, position, product_id, product_name, quantity, list_unit_price, price_list_id, discount_amount, line_total)
       VALUES (?, ?, 1, 'p1', 'Producto', 1, ?, 'list-1', 0, ?)`,
    )
    .run(`${id}-line`, id, lineTotal, lineTotal);
}

beforeEach(() => {
  database = openFiscalDatabase();
  database.exec(
    `INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state, closed_at)
     VALUES ('closed-session', 'register-1', 'device-a', 'u1', '2026-09-29T08:00:00.000Z', 0, 'CLOSED', '2026-09-29T20:00:00.000Z')`,
  );
});

afterEach(() => {
  database.close();
});

describe("the completed sales the register reads at startup", () => {
  it("are those of the open cash session, with their time, total and print times", () => {
    addSale({
      id: "sale-1",
      occurredAt: "2026-09-30T12:05:00.000Z",
      printAttemptedAt: "2026-09-30T12:06:00.000Z",
      printedAt: null,
      lineTotal: 4500,
    });

    expect(new SqliteStartupSales(database).completedSalesOfOpenSession()).toEqual([
      {
        saleId: "sale-1",
        completedAt: new Date("2026-09-30T12:05:00.000Z"),
        total: 4500,
        printAttemptedAt: new Date("2026-09-30T12:06:00.000Z"),
        printedAt: null,
      },
    ]);
  });

  it("carry the time the ticket was handed to the printer", () => {
    addSale({
      id: "sale-1",
      printAttemptedAt: "2026-09-30T12:06:00.000Z",
      printedAt: "2026-09-30T12:06:01.000Z",
    });

    expect(new SqliteStartupSales(database).completedSalesOfOpenSession()).toMatchObject([
      { printedAt: new Date("2026-09-30T12:06:01.000Z") },
    ]);
  });

  it("come oldest first", () => {
    addSale({ id: "later", occurredAt: "2026-09-30T13:00:00.000Z" });
    addSale({ id: "earlier", occurredAt: "2026-09-30T12:00:00.000Z" });

    expect(
      new SqliteStartupSales(database).completedSalesOfOpenSession().map(({ saleId }) => saleId),
    ).toEqual(["earlier", "later"]);
  });

  it("leave out the sale being rung, a cancelled sale and the sales of a closed session", () => {
    addSale({ id: "open", state: "OPEN", occurredAt: null });
    addSale({ id: "cancelled", state: "CANCELLED" });
    addSale({ id: "old", session: "closed-session" });

    expect(new SqliteStartupSales(database).completedSalesOfOpenSession()).toEqual([]);
  });

  it("are none while no cash session is open", () => {
    addSale({ id: "sale-1" });
    database.exec(
      "UPDATE cash_sessions SET state = 'CLOSED', closed_at = '2026-09-30T20:00:00.000Z' WHERE id = 'session-1'",
    );

    expect(new SqliteStartupSales(database).completedSalesOfOpenSession()).toEqual([]);
  });
});
