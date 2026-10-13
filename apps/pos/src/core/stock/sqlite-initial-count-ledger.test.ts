import type { RoleAccess } from "@purosur/domain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import { SqliteInitialCountLedger } from "./sqlite-initial-count-ledger";

const CHAIN_KEY = Buffer.from("0123456789abcdef0123456789abcdef").toString("base64");
const COUNTED_AT = new Date("2026-10-09T15:00:00.000Z");
const COUNTER: RoleAccess = {
  isAdministrator: false,
  permissionKeys: ["record_initial_inventory"],
};

let database: LocalDatabase;

function ledger(
  options: { chainKey?: string | undefined; access?: RoleAccess | undefined } = {},
): SqliteInitialCountLedger {
  const chainKey = "chainKey" in options ? options.chainKey : CHAIN_KEY;
  const access = options.access ?? COUNTER;
  return new SqliteInitialCountLedger(
    database,
    { activePerson: (userId) => (userId === "u1" ? { firstName: "Ada", access } : undefined) },
    chainKey,
  );
}

function addProduct(
  id: string,
  options: { name?: string; unit?: string; active?: boolean; removed?: boolean } = {},
): void {
  database
    .prepare(
      `INSERT INTO products (id, name, category_id, sale_unit, active, version, removed)
       VALUES (?, ?, 'c', ?, ?, 1, ?)`,
    )
    .run(
      id,
      options.name ?? "Yerba",
      options.unit ?? "UNIT",
      options.active === false ? 0 : 1,
      options.removed ? 1 : 0,
    );
}

function addBarcode(productId: string, code: string, active = true): void {
  database
    .prepare(
      "INSERT INTO product_barcodes (product_id, position, code, active) VALUES (?, 1, ?, ?)",
    )
    .run(productId, code, active ? 1 : 0);
}

beforeEach(() => {
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
  database.prepare("UPDATE sync_state SET device_id = 'device-1'").run();
});

afterEach(() => {
  database.close();
});

describe("the initial count's access", () => {
  it("is the role access of the active person asked about", () => {
    expect(ledger().transaction((tx) => tx.actorAccess("u1"))).toEqual(COUNTER);
    expect(ledger().transaction((tx) => tx.actorAccess("someone-else"))).toBeUndefined();
  });

  it("knows the branch's first cash session once it was pulled", () => {
    expect(ledger().transaction((tx) => tx.branchFirstSessionOpened())).toBe(false);

    database
      .prepare(
        "INSERT INTO branch_first_cash_sessions (location_id, opened_at) VALUES ('location', '2026-10-10T12:00:00.000Z')",
      )
      .run();

    expect(ledger().transaction((tx) => tx.branchFirstSessionOpened())).toBe(true);
  });

  it("knows the register opened a cash session", () => {
    expect(ledger().transaction((tx) => tx.ownSessionEverOpened())).toBe(false);

    database
      .prepare(
        `INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
         VALUES ('s1', 'register-1', 'device-1', 'u1', '2026-10-10T12:00:00.000Z', 0, 'OPEN')`,
      )
      .run();

    expect(ledger().transaction((tx) => tx.ownSessionEverOpened())).toBe(true);
  });

  it("is ready to write events only with the outbox chain key", () => {
    expect(ledger().transaction((tx) => tx.outboxReady())).toBe(true);
    expect(ledger({ chainKey: undefined }).transaction((tx) => tx.outboxReady())).toBe(false);
  });
});

describe("the products the initial count finds", () => {
  beforeEach(() => {
    addProduct("p1", { name: "Yerba" });
    addBarcode("p1", "7790001");
    addProduct("p2", { name: "Queso", unit: "KG" });
    addProduct("inactive", { active: false });
    addBarcode("inactive", "7790002");
    addProduct("removed", { removed: true });
    addBarcode("removed", "7790003");
    addBarcode("p2", "7790004", false);
  });

  it("is an active product by its id", () => {
    const find = (id: string) => ledger().transaction((tx) => tx.activeProductById(id));

    expect(find("p2")).toEqual({ id: "p2", name: "Queso", saleUnit: "KG" });
    expect(find("inactive")).toBeUndefined();
    expect(find("removed")).toBeUndefined();
  });

  it("is an active product by an active barcode", () => {
    const find = (code: string) => ledger().transaction((tx) => tx.activeProductByBarcode(code));

    expect(find("7790001")).toEqual({ id: "p1", name: "Yerba", saleUnit: "UNIT" });
    expect(find("7790002")).toBeUndefined();
    expect(find("7790003")).toBeUndefined();
    expect(find("7790004")).toBeUndefined();
  });

  it("is every active product to search by name, with the times this register sold it", () => {
    expect(ledger().transaction((tx) => tx.searchableProducts())).toEqual([
      { id: "p1", name: "Yerba", saleUnit: "UNIT", timesSoldHere: 0 },
      { id: "p2", name: "Queso", saleUnit: "KG", timesSoldHere: 0 },
    ]);
  });
});

describe("the lines of the initial count", () => {
  beforeEach(() => {
    addProduct("p1", { name: "Yerba" });
    addProduct("p2", { name: "Queso", unit: "KG" });
  });

  function record(
    id: string,
    kind: "opening_count" | "opening_count_withdrawal",
    values: {
      productId: string;
      delta: number;
      occurredAt?: Date;
      expiresOn?: string | null;
      withdrawsMovementId?: string | null;
    },
  ): void {
    ledger().transaction((tx) =>
      tx.recordInitialCountMovement({
        id,
        kind,
        occurredAt: COUNTED_AT,
        expiresOn: null,
        withdrawsMovementId: null,
        ...values,
      }),
    );
  }

  it("stores a counted line as a movement with its expiry", () => {
    record("m1", "opening_count", { productId: "p1", delta: 6, expiresOn: "2026-12-31" });

    expect(
      database
        .prepare(
          "SELECT id, product_id, kind, delta, occurred_at, expires_on, withdraws_movement_id, sale_line_id, superseded_by_count_id FROM stock_movements",
        )
        .all(),
    ).toEqual([
      {
        id: "m1",
        product_id: "p1",
        kind: "opening_count",
        delta: 6,
        occurred_at: COUNTED_AT.toISOString(),
        expires_on: "2026-12-31",
        withdraws_movement_id: null,
        sale_line_id: null,
        superseded_by_count_id: null,
      },
    ]);
  });

  it("reads a counted line with its product, and whether it was withdrawn", () => {
    record("m1", "opening_count", { productId: "p2", delta: 1500, expiresOn: "2026-12-31" });
    record("m2", "opening_count", { productId: "p1", delta: 6 });
    record("w2", "opening_count_withdrawal", {
      productId: "p1",
      delta: -6,
      withdrawsMovementId: "m2",
    });
    const read = (id: string) => ledger().transaction((tx) => tx.initialCountLine(id));

    expect(read("m1")).toEqual({
      movementId: "m1",
      productId: "p2",
      productName: "Queso",
      saleUnit: "KG",
      counted: 1500,
      expiresOn: "2026-12-31",
      confirmedAt: COUNTED_AT,
      withdrawn: false,
    });
    expect(read("m2")?.withdrawn).toBe(true);
    expect(read("w2")).toBeUndefined();
    expect(read("unknown")).toBeUndefined();
  });

  it("lists the lines that were not withdrawn", () => {
    record("m1", "opening_count", { productId: "p2", delta: 1500 });
    record("m2", "opening_count", { productId: "p1", delta: 6 });
    record("w2", "opening_count_withdrawal", {
      productId: "p1",
      delta: -6,
      withdrawsMovementId: "m2",
    });

    const lines = ledger().transaction((tx) => tx.notWithdrawnInitialCountLines());

    expect(lines.map((line) => line.movementId)).toEqual(["m1"]);
  });

  it("refuses a second movement under the same id", () => {
    record("m1", "opening_count", { productId: "p1", delta: 6 });

    expect(() => record("m1", "opening_count", { productId: "p1", delta: 2 })).toThrow();
  });
});

describe("the initial count's writes", () => {
  it("add each delta to the product's stock balance", () => {
    ledger().transaction((tx) => {
      tx.addToStockBalance("p1", 6);
      tx.addToStockBalance("p1", -2);
    });

    expect(database.prepare("SELECT product_id, quantity FROM stock_balances").all()).toEqual([
      { product_id: "p1", quantity: 4 },
    ]);
  });

  it("append an event to the outbox chain", () => {
    ledger().transaction((tx) =>
      tx.appendOutboxEvent({
        event_id: "e1",
        aggregate_type: "StockMovement",
        aggregate_id: "m1",
        event_type: "opening_count_recorded",
        schema_version: 1,
        payload: { movement_id: "m1" },
        occurred_at: COUNTED_AT.toISOString(),
        actor_id: "u1",
      }),
    );

    expect(database.prepare("SELECT event_id, event_type, device_seq FROM outbox").all()).toEqual([
      { event_id: "e1", event_type: "opening_count_recorded", device_seq: 1 },
    ]);
  });

  it("refuse an event without the outbox chain key", () => {
    expect(() =>
      ledger({ chainKey: undefined }).transaction((tx) =>
        tx.appendOutboxEvent({
          event_id: "e1",
          aggregate_type: "StockMovement",
          aggregate_id: "m1",
          event_type: "opening_count_recorded",
          schema_version: 1,
          payload: {},
          occurred_at: COUNTED_AT.toISOString(),
          actor_id: "u1",
        }),
      ),
    ).toThrow();
  });

  it("are all undone when the work fails", () => {
    expect(() =>
      ledger().transaction((tx) => {
        tx.addToStockBalance("p1", 6);
        throw new Error("fails");
      }),
    ).toThrow("fails");

    expect(database.prepare("SELECT * FROM stock_balances").all()).toEqual([]);
  });
});
