import type { SyncChange } from "@purosur/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import { addToStockBalance, insertSaleStockMovement } from "../stock/sqlite-stock-ledger";
import type { RegisterPulledChange } from "./pulled-change";
import { SqliteLocalReplica } from "./sqlite-local-replica";

const PEPPER = Buffer.alloc(32, 7).toString("base64url");
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

async function save(...changes: RegisterPulledChange[]) {
  const cursor = changes.at(-1)?.changeSeq ?? 0;
  await replica.savePage({ changes, cursor, hasMore: false });
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
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
  replica = new SqliteLocalReplica(database);
  replica.adoptDevice({ deviceId: "device-a", pepper: PEPPER });
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
});
