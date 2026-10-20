import type { SyncChange } from "@purosur/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { addToStockBalance, insertSaleStockMovement } from "../stock/sqlite-stock-ledger";
import type { RegisterPulledChange } from "./pulled-change";
import type { SqliteLocalReplica } from "./sqlite-local-replica";
import { openAdoptedReplica, savePulledChanges } from "./test-support/sqlite-local-replica";

const PRODUCT_ID = "0b1d2f4a-6c3e-4b7d-9a58-1e2f3a4b5c6d";
const SOLD_AT = "2026-10-09T14:20:00.000Z";
const COUNTED_AT = "2026-10-09T15:00:00.000Z";

function stockMovementChange(
  changeSeq: number,
  entityId: string,
  row: Partial<Extract<SyncChange, { entity: "stock_movement" }>["row"]> = {},
): RegisterPulledChange {
  const change: SyncChange = {
    change_seq: changeSeq,
    entity: "stock_movement",
    entity_id: entityId,
    row: {
      product_id: PRODUCT_ID,
      kind: "adjustment",
      delta: 4000,
      occurred_at: COUNTED_AT,
      superseded_by_count_id: null,
      version: 1,
      ...row,
    },
  };
  return { changeSeq, change };
}

function save(...changes: RegisterPulledChange[]) {
  return savePulledChanges(replica, ...changes);
}

function balance(): number | undefined {
  return database
    .prepare<[string], { quantity: number }>(
      "SELECT quantity FROM stock_balances WHERE product_id = ?",
    )
    .get(PRODUCT_ID)?.quantity;
}

function sellOwnLine(movementId: string, delta: number): void {
  database.exec(
    `INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
     VALUES ('session-1', 'register-1', 'device-a', 'u1', '2026-10-09T08:00:00.000Z', 0, 'OPEN');
     INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at)
     VALUES ('sale-1', 'register-1', 'device-a', 'session-1', 'u1', 'COMPLETED', '2026-10-09T14:20:00.000Z');
     INSERT INTO sale_lines (id, sale_id, position, product_id, product_name, quantity, list_unit_price, price_list_id, line_total)
     VALUES ('line-1', 'sale-1', 1, '0b1d2f4a-6c3e-4b7d-9a58-1e2f3a4b5c6d', 'Yerba', 3, 1500, 'list-1', 4500);`,
  );
  insertSaleStockMovement(database, {
    id: movementId,
    saleLineId: "line-1",
    productId: PRODUCT_ID,
    delta,
    occurredAt: new Date(SOLD_AT),
  });
  addToStockBalance(database, PRODUCT_ID, delta);
}

let database: LocalDatabase;
let replica: SqliteLocalReplica;

beforeEach(() => {
  ({ database, replica } = openAdoptedReplica());
  addToStockBalance(database, PRODUCT_ID, 10_000);
});

afterEach(() => {
  database.close();
});

describe("the stock movements a register pulls", () => {
  it("move the register's balance by each movement recorded elsewhere, once however many times it arrives", async () => {
    const page = [
      stockMovementChange(1, "backoffice-adjustment"),
      stockMovementChange(2, "other-register-sale", { kind: "sale", delta: -3000 }),
    ];

    await save(...page);
    await save(...page);

    expect(balance()).toBe(11_000);
    expect(await replica.savedCursor()).toBe(2);
  });

  it("grow the register's balance by a purchase's receipt, once however many times it arrives", async () => {
    const page = [stockMovementChange(1, "purchase-receipt", { kind: "receipt", delta: 6000 })];

    await save(...page);
    await save(...page);

    expect(balance()).toBe(16_000);
  });

  it("end at the counted balance after a sale made offline and a count registered before it reached the cloud", async () => {
    sellOwnLine("own-sale-movement", -3000);
    expect(balance()).toBe(7000);

    await save(stockMovementChange(1, "backoffice-count", { kind: "count", delta: -3000 }));
    expect(balance()).toBe(4000);
    await save(
      stockMovementChange(2, "own-sale-movement", {
        kind: "sale",
        delta: -3000,
        occurred_at: SOLD_AT,
        superseded_by_count_id: "backoffice-count",
      }),
    );

    expect(balance()).toBe(7000);
  });

  it("never count twice a sale the register made that no count superseded", async () => {
    sellOwnLine("own-sale-movement", -3000);

    await save(
      stockMovementChange(1, "own-sale-movement", {
        kind: "sale",
        delta: -3000,
        occurred_at: SOLD_AT,
      }),
    );

    expect(balance()).toBe(7000);
  });

  it("never count twice a sale of the snapshot's old installation that comes back by pull once the register took a new one", async () => {
    sellOwnLine("own-sale-movement", -3000);
    database.prepare("UPDATE sync_state SET device_id = 'device-b'").run();

    await save(
      stockMovementChange(1, "own-sale-movement", {
        kind: "sale",
        delta: -3000,
        occurred_at: SOLD_AT,
      }),
    );

    expect(balance()).toBe(7000);
    expect(database.prepare("SELECT COUNT(*) AS total FROM stock_movements").get()).toEqual({
      total: 1,
    });
  });

  it.each([
    ["an initial count", "opening_count", 5000, 15_000],
    ["the withdrawal of an initial count", "opening_count_withdrawal", -5000, 5000],
    ["the components an assembled batch consumed", "assembly_out", -4000, 6000],
    ["the output an assembled batch made", "assembly_in", 14_000, 24_000],
  ] as const)("replicate %s recorded at another register", async (_, kind, delta, expected) => {
    await save(stockMovementChange(1, "other-register-count", { kind, delta }));

    expect(balance()).toBe(expected);
    expect(
      database.prepare("SELECT kind, expires_on, withdraws_movement_id FROM stock_movements").all(),
    ).toEqual([{ kind, expires_on: null, withdraws_movement_id: null }]);
  });

  it("adopt the delta the cloud applied to an initial count withdrawal the register recorded", async () => {
    database
      .prepare(
        `INSERT INTO stock_movements (id, product_id, kind, delta, occurred_at, withdraws_movement_id)
         VALUES ('own-withdrawal', ?, 'opening_count_withdrawal', -5000, ?, 'own-count')`,
      )
      .run(PRODUCT_ID, COUNTED_AT);
    addToStockBalance(database, PRODUCT_ID, -5000);
    const arrival = stockMovementChange(1, "own-withdrawal", {
      kind: "opening_count_withdrawal",
      delta: -3000,
    });

    await save(arrival);
    await save(arrival);

    expect(balance()).toBe(7000);
    expect(
      database.prepare("SELECT delta, withdraws_movement_id FROM stock_movements").all(),
    ).toEqual([{ delta: -3000, withdraws_movement_id: "own-count" }]);
  });
});
