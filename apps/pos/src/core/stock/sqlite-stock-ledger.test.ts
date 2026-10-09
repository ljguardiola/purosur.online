import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import {
  addToStockBalance,
  insertSaleStockMovement,
  SqliteReplicatedStockLedger,
} from "./sqlite-stock-ledger";

const SOLD_AT = new Date("2026-09-30T12:00:00.000Z");

let database: LocalDatabase;

function addSaleLine(lineId: string): void {
  database
    .prepare(
      `INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
       VALUES ('session-1', 'register-1', 'device-1', 'u1', '2026-09-30T08:00:00.000Z', 0, 'OPEN')
       ON CONFLICT DO NOTHING`,
    )
    .run();
  database
    .prepare(
      `INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at)
       VALUES ('sale-1', 'register-1', 'device-1', 'session-1', 'u1', 'COMPLETED', '2026-09-30T12:00:00.000Z')
       ON CONFLICT DO NOTHING`,
    )
    .run();
  database
    .prepare(
      `INSERT INTO sale_lines (id, sale_id, position, product_id, product_name, quantity, list_unit_price, price_list_id, line_total)
       VALUES (?, 'sale-1', (SELECT count(*) + 1 FROM sale_lines), ?, 'Yerba', 2, 1500, 'list-1', 3000)`,
    )
    .run(lineId, `product-of-${lineId}`);
}

function movementRows() {
  return database
    .prepare(
      "SELECT id, product_id, kind, sale_line_id, delta, occurred_at FROM stock_movements ORDER BY rowid",
    )
    .all();
}

beforeEach(() => {
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
});

afterEach(() => {
  database.close();
});

describe("recording a sale's stock movement", () => {
  it("stores the movement of the sale line, as the sale kind, dated when the sale was charged", () => {
    addSaleLine("line-1");

    insertSaleStockMovement(database, {
      id: "movement-1",
      saleLineId: "line-1",
      productId: "p1",
      delta: -2000,
      occurredAt: SOLD_AT,
    });

    expect(movementRows()).toEqual([
      {
        id: "movement-1",
        product_id: "p1",
        kind: "sale",
        sale_line_id: "line-1",
        delta: -2000,
        occurred_at: SOLD_AT.toISOString(),
      },
    ]);
  });

  it("refuses a movement of a sale line that doesn't exist", () => {
    expect(() =>
      insertSaleStockMovement(database, {
        id: "movement-1",
        saleLineId: "missing",
        productId: "p1",
        delta: -2000,
        occurredAt: SOLD_AT,
      }),
    ).toThrow();
  });

  it("refuses a second movement under the same id", () => {
    addSaleLine("line-1");
    const movement = {
      id: "movement-1",
      saleLineId: "line-1",
      productId: "p1",
      delta: -2000,
      occurredAt: SOLD_AT,
    };
    insertSaleStockMovement(database, movement);

    expect(() => insertSaleStockMovement(database, movement)).toThrow();
  });
});

describe("a product's stock balance", () => {
  function balances() {
    return database
      .prepare("SELECT product_id, quantity FROM stock_balances ORDER BY product_id")
      .all();
  }

  it("starts at the first delta it is given, below zero when stock was sold", () => {
    addToStockBalance(database, "p1", -2000);

    expect(balances()).toEqual([{ product_id: "p1", quantity: -2000 }]);
  });

  it("adds each delta to what the balance already holds", () => {
    database.prepare("INSERT INTO stock_balances (product_id, quantity) VALUES ('p1', 5000)").run();

    addToStockBalance(database, "p1", -2000);
    addToStockBalance(database, "p1", -1000);

    expect(balances()).toEqual([{ product_id: "p1", quantity: 2000 }]);
  });

  it("keeps the balance of every other product", () => {
    addToStockBalance(database, "p1", -2000);
    addToStockBalance(database, "p2", -500);

    expect(balances()).toEqual([
      { product_id: "p1", quantity: -2000 },
      { product_id: "p2", quantity: -500 },
    ]);
  });
});

describe("the stock movements the register pulls from the cloud", () => {
  const pulled = {
    id: "cloud-movement-1",
    productId: "p1",
    kind: "loss" as const,
    delta: -1000,
    occurredAt: SOLD_AT,
    supersededByCountId: null,
  };

  function pulledRows() {
    return database
      .prepare(
        "SELECT id, product_id, kind, sale_line_id, delta, occurred_at, superseded_by_count_id FROM stock_movements ORDER BY rowid",
      )
      .all();
  }

  it("knows nothing of a movement it never recorded", () => {
    expect(new SqliteReplicatedStockLedger(database).movement("cloud-movement-1")).toBeUndefined();
  });

  it("records a pulled movement with no sale line of its own, and the count that superseded it", () => {
    const ledger = new SqliteReplicatedStockLedger(database);

    ledger.recordMovement(pulled);
    ledger.recordMovement({
      ...pulled,
      id: "cloud-movement-2",
      kind: "sale",
      supersededByCountId: "count-1",
    });

    expect(pulledRows()).toEqual([
      {
        id: "cloud-movement-1",
        product_id: "p1",
        kind: "loss",
        sale_line_id: null,
        delta: -1000,
        occurred_at: SOLD_AT.toISOString(),
        superseded_by_count_id: null,
      },
      {
        id: "cloud-movement-2",
        product_id: "p1",
        kind: "sale",
        sale_line_id: null,
        delta: -1000,
        occurred_at: SOLD_AT.toISOString(),
        superseded_by_count_id: "count-1",
      },
    ]);
    expect(ledger.movement("cloud-movement-2")).toEqual({ supersededByCountId: "count-1" });
  });

  it("marks the register's own sale movement as superseded by a count", () => {
    addSaleLine("line-1");
    insertSaleStockMovement(database, {
      id: "own-movement",
      saleLineId: "line-1",
      productId: "p1",
      delta: -2000,
      occurredAt: SOLD_AT,
    });
    const ledger = new SqliteReplicatedStockLedger(database);
    expect(ledger.movement("own-movement")).toEqual({ supersededByCountId: null });

    ledger.markSuperseded("own-movement", "count-1");

    expect(ledger.movement("own-movement")).toEqual({ supersededByCountId: "count-1" });
  });

  it("adds a pulled delta to the product's balance", () => {
    const ledger = new SqliteReplicatedStockLedger(database);

    ledger.addToBalance("p1", 3000);
    ledger.addToBalance("p1", -1000);

    expect(database.prepare("SELECT product_id, quantity FROM stock_balances").all()).toEqual([
      { product_id: "p1", quantity: 2000 },
    ]);
  });
});
