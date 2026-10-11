import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import type { RegisterPulledChange } from "./pulled-change";
import type { PULLED_TABLES } from "./pulled-tables";
import { SqliteLocalReplica } from "./sqlite-local-replica";
import { changesOfEntity } from "./test-support/pulled-changes-of-every-entity";
import {
  openAdoptedReplica,
  savePulledChanges,
  TEST_PEPPER,
} from "./test-support/sqlite-local-replica";

type Entity = (typeof PULLED_TABLES)[keyof typeof PULLED_TABLES];

let database: LocalDatabase;
let replica: SqliteLocalReplica;

beforeEach(() => {
  ({ database, replica } = openAdoptedReplica());
});

afterEach(() => {
  database.close();
});

function declare(table: string, cursor = 0): void {
  database
    .prepare("INSERT OR REPLACE INTO pulled_table_redeliveries (table_name, cursor) VALUES (?, ?)")
    .run(table, cursor);
}

function declaredTables(): string[] {
  return database
    .prepare<[], { table_name: string }>(
      "SELECT table_name FROM pulled_table_redeliveries ORDER BY table_name",
    )
    .all()
    .map((row) => row.table_name);
}

function declaredCursor(table: string): number | undefined {
  return database
    .prepare<[string], { cursor: number }>(
      "SELECT cursor FROM pulled_table_redeliveries WHERE table_name = ?",
    )
    .get(table)?.cursor;
}

function pullCursor(): number | undefined {
  return database.prepare<[], { pull_cursor: number }>("SELECT pull_cursor FROM sync_state").get()
    ?.pull_cursor;
}

function upsertOf(entity: Entity): RegisterPulledChange {
  const [upsert] = changesOfEntity(entity);
  if (upsert === undefined) {
    throw new Error("test setup: an entity has no change");
  }
  return upsert;
}

function withRow(change: RegisterPulledChange, row: object): RegisterPulledChange {
  const { change: pulled } = change;
  if (!("row" in pulled)) {
    throw new Error("test setup: a removal has no row");
  }
  return {
    changeSeq: change.changeSeq,
    change: { ...pulled, row: { ...pulled.row, ...row } } as typeof pulled,
  };
}

function atChangeSeq(change: RegisterPulledChange, changeSeq: number): RegisterPulledChange {
  return { changeSeq, change: { ...change.change, change_seq: changeSeq } };
}

function redeliver(entity: Entity, ...changes: RegisterPulledChange[]) {
  const cursor = changes.at(-1)?.changeSeq ?? 0;
  return replica.saveRedeliveredPage(entity, { changes, cursor, hasMore: false });
}

function column(table: string, name: string): unknown {
  return Object.values(
    database.prepare<[], Record<string, unknown>>(`SELECT ${name} FROM ${table}`).get() ?? {},
  )[0];
}

describe("the redeliveries a register is waiting for", () => {
  it("holds the point of sale's in a register whose installation the migrations found already adopted", async () => {
    const migrated = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);

    expect(await new SqliteLocalReplica(migrated).pendingRedeliveries()).toEqual([
      { entity: "register_point_of_sale", cursor: 0 },
    ]);
    migrated.close();
  });

  it("names an entity once however many of its tables are declared, from the lowest cursor of them", async () => {
    database.exec("DELETE FROM pulled_table_redeliveries");
    declare("products", 5);
    declare("product_barcodes", 3);
    declare("product_tags", 9);
    declare("users", 2);

    expect(await replica.pendingRedeliveries()).toEqual([
      { entity: "product", cursor: 3 },
      { entity: "user", cursor: 2 },
    ]);
  });

  it("names nothing for a table the register no longer fills from a pull", async () => {
    database.exec("DELETE FROM pulled_table_redeliveries");
    declare("sale_lines");

    expect(await replica.pendingRedeliveries()).toEqual([]);
  });

  it("saves a page's cursor for every declared table of its entity, leaving the pull cursor and other tables alone", async () => {
    database.exec("DELETE FROM pulled_table_redeliveries");
    declare("products");
    declare("product_barcodes");
    declare("users", 4);
    database.prepare("UPDATE sync_state SET pull_cursor = 40").run();

    await replica.saveRedeliveredPage("product", { changes: [], cursor: 12, hasMore: true });

    expect(declaredCursor("products")).toBe(12);
    expect(declaredCursor("product_barcodes")).toBe(12);
    expect(declaredCursor("users")).toBe(4);
    expect(pullCursor()).toBe(40);
  });

  it("saves neither the rows nor the cursor of a page that fails", async () => {
    database.exec("DELETE FROM pulled_table_redeliveries");
    declare("categories");
    database.exec("DROP TABLE categories");

    await expect(redeliver("category", upsertOf("category"))).rejects.toThrow();

    expect(declaredCursor("categories")).toBe(0);
  });

  it("forgets only the tables of the entity it finishes", async () => {
    database.exec("DELETE FROM pulled_table_redeliveries");
    declare("products");
    declare("product_barcodes");
    declare("users");

    await replica.finishRedelivery("product");

    expect(declaredTables()).toEqual(["users"]);
  });

  it("are forgotten when the register is installed anew, which pulls everything from the first change", () => {
    declare("users", 3);

    replica.adoptDevice({ deviceId: "device-b", pepper: TEST_PEPPER });

    expect(declaredTables()).toEqual([]);
  });

  it("are kept when the same installation is adopted again", () => {
    declare("users", 3);

    replica.adoptDevice({ deviceId: "device-a", pepper: TEST_PEPPER });

    expect(declaredTables()).toContain("users");
  });
});

const STALE_COLUMNS: [Entity, string, string, string][] = [
  ["branch_settings", "branch_settings", "address", "'stale'"],
  ["category", "categories", "name", "'stale'"],
  ["product", "products", "name", "'stale'"],
  ["product", "product_barcodes", "code", "'stale'"],
  ["product", "product_tags", "active", "0"],
  ["tag", "tags", "name", "'stale'"],
  ["price_list", "price_lists", "name", "'stale'"],
  ["price", "prices", "unit_price", "1"],
  ["user", "users", "first_name", "'stale'"],
  ["user", "pin_verifiers", "verifier", "'stale'"],
  ["role", "roles", "name", "'stale'"],
  ["role", "role_permissions", "active", "0"],
  ["register", "own_register", "name", "'stale'"],
  ["register_point_of_sale", "register_point_of_sale", "fiscal_address_id", "'stale'"],
  [
    "register_point_of_sale",
    "register_point_of_sale",
    "tax_authority_last_authorized_number",
    "NULL",
  ],
  [
    "register_offline_point_of_sale",
    "register_offline_point_of_sale",
    "point_of_sale_number",
    "99",
  ],
  [
    "register_offline_point_of_sale",
    "register_offline_point_of_sale",
    "tax_authority_last_authorized_number",
    "NULL",
  ],
  ["discount", "discounts", "name", "'stale'"],
  ["issuer_identification", "issuer_identification_versions", "legal_name", "'stale'"],
  ["buyer_identification_threshold", "buyer_identification_thresholds", "amount", "1"],
  ["buyer_tax_status_set", "buyer_tax_status_sets", "options", "'[]'"],
  ["offline_authorization_code", "offline_authorization_codes", "code", "'stale'"],
  ["offline_number_block", "offline_number_blocks", "last_number", "7"],
];

describe("a redelivered page", () => {
  it.each(STALE_COLUMNS)(
    "rewrites, for %s, the %s.%s a pull left stale at the same version",
    async (entity, table, name, stale) => {
      const change = upsertOf(entity);
      await savePulledChanges(replica, change);
      const pristine = column(table, name);
      database.exec(`UPDATE ${table} SET ${name} = ${stale}`);

      await redeliver(entity, change);

      expect(column(table, name)).toEqual(pristine);
    },
  );

  it.each(STALE_COLUMNS.filter(([, , name]) => name !== "tax_authority_last_authorized_number"))(
    "is not what a normal pull does, for %s, with %s.%s at the same version",
    async (entity, table, name, stale) => {
      const change = upsertOf(entity);
      await savePulledChanges(replica, change);
      database.exec(`UPDATE ${table} SET ${name} = ${stale}`);
      const staleValue = column(table, name);

      await savePulledChanges(replica, change);

      expect(column(table, name)).toEqual(staleValue);
    },
  );

  const VERSIONED: [Entity, string][] = [
    ["branch_settings", "branch_settings"],
    ["category", "categories"],
    ["product", "products"],
    ["tag", "tags"],
    ["price_list", "price_lists"],
    ["price", "prices"],
    ["user", "users"],
    ["role", "roles"],
    ["register", "own_register"],
    ["register_point_of_sale", "register_point_of_sale"],
    ["register_offline_point_of_sale", "register_offline_point_of_sale"],
    ["discount", "discounts"],
    ["offline_authorization_code", "offline_authorization_codes"],
    ["offline_number_block", "offline_number_blocks"],
  ];

  it.each(VERSIONED)("never overwrites a newer %s version of %s", async (entity, table) => {
    const change = upsertOf(entity);
    await savePulledChanges(replica, withRow(change, { version: 2 }));
    const held = database.prepare(`SELECT * FROM ${table}`).all();

    await redeliver(entity, atChangeSeq(change, 5));

    expect(database.prepare(`SELECT * FROM ${table}`).all()).toEqual(held);
  });

  it("brings in a version newer than the one held, as a pull does", async () => {
    await savePulledChanges(replica, upsertOf("category"));

    await redeliver("category", withRow(upsertOf("category"), { name: "Nuevo", version: 3 }));

    expect(database.prepare("SELECT name, version FROM categories").all()).toEqual([
      { name: "Nuevo", version: 3 },
    ]);
  });

  it("brings in a row the register never received", async () => {
    await redeliver("tag", upsertOf("tag"));

    expect(database.prepare("SELECT name FROM tags").all()).toEqual([{ name: "Sin TACC" }]);
  });

  it("deactivates the barcodes and tags the cloud no longer lists, as a pull does", async () => {
    await savePulledChanges(replica, upsertOf("product"));

    await redeliver("product", withRow(upsertOf("product"), { barcodes: [], tag_ids: [] }));

    expect(database.prepare("SELECT active FROM product_barcodes").all()).toEqual([{ active: 0 }]);
    expect(database.prepare("SELECT active FROM product_tags").all()).toEqual([{ active: 0 }]);
  });

  it("does not undo a removal the register already applied", async () => {
    const [upsert, removal] = changesOfEntity("category");
    if (upsert === undefined || removal === undefined) {
      throw new Error("test setup: a category has no removal");
    }
    await savePulledChanges(replica, upsert, removal);

    await redeliver("category", atChangeSeq(removal, 7));

    expect(database.prepare("SELECT removed, version FROM categories").all()).toEqual([
      { removed: 1, version: 2 },
    ]);
  });
});

describe("what a register owns, kept by a redelivered page", () => {
  const PIN_REDEEMED_HERE = "cmVkZWVtZWQ";

  async function holdAUserWhoRedeemedAPin() {
    await savePulledChanges(replica, withRow(upsertOf("user"), { salt: null, pin_hash: null }));
    database.prepare("UPDATE users SET salt = ?").run(PIN_REDEEMED_HERE);
    database.exec("INSERT INTO pin_verifiers (user_id, verifier) SELECT id, 'redeemed' FROM users");
  }

  it("keeps the salt and the verifier of a PIN redeemed here while the cloud row has none", async () => {
    await holdAUserWhoRedeemedAPin();

    await redeliver(
      "user",
      withRow(upsertOf("user"), { first_name: "Ada L.", salt: null, pin_hash: null }),
    );

    expect(database.prepare("SELECT first_name, salt FROM users").all()).toEqual([
      { first_name: "Ada L.", salt: PIN_REDEEMED_HERE },
    ]);
    expect(database.prepare("SELECT verifier FROM pin_verifiers").all()).toEqual([
      { verifier: "redeemed" },
    ]);
  });

  it("takes the salt and the PIN the cloud holds", async () => {
    await holdAUserWhoRedeemedAPin();

    await redeliver("user", upsertOf("user"));

    expect(database.prepare("SELECT salt FROM users").all()).toEqual([{ salt: "c2FsdA" }]);
    expect(database.prepare("SELECT verifier FROM pin_verifiers").all()).not.toEqual([
      { verifier: "redeemed" },
    ]);
  });

  it("drops the PIN of a newer version that has none, as a pull does", async () => {
    await holdAUserWhoRedeemedAPin();

    await redeliver("user", withRow(upsertOf("user"), { salt: null, pin_hash: null, version: 2 }));

    expect(database.prepare("SELECT salt FROM users").all()).toEqual([{ salt: null }]);
    expect(database.prepare("SELECT verifier FROM pin_verifiers").all()).toEqual([]);
  });

  it("does not count a stock movement again, nor one the register recorded itself", async () => {
    await savePulledChanges(replica, upsertOf("stock_movement"));
    const held = database.prepare("SELECT * FROM stock_balances").all();
    const movements = database.prepare("SELECT * FROM stock_movements").all();

    await redeliver("stock_movement", upsertOf("stock_movement"));

    expect(database.prepare("SELECT * FROM stock_balances").all()).toEqual(held);
    expect(database.prepare("SELECT * FROM stock_movements").all()).toEqual(movements);
  });

  it("counts a stock movement the register never received once", async () => {
    await redeliver("stock_movement", upsertOf("stock_movement"));
    await redeliver("stock_movement", upsertOf("stock_movement"));

    expect(database.prepare("SELECT quantity FROM stock_balances").all()).toEqual([
      { quantity: 4000 },
    ]);
  });

  it.each([
    ["register_point_of_sale", "register_point_of_sale"],
    ["register_offline_point_of_sale", "register_offline_point_of_sale"],
  ] as const)("never takes the count of the %s back", async (entity, table) => {
    const change = upsertOf(entity);
    await savePulledChanges(replica, withRow(change, { tax_authority_last_authorized_number: 12 }));

    await redeliver(entity, withRow(change, { tax_authority_last_authorized_number: null }));
    expect(column(table, "tax_authority_last_authorized_number")).toBe(12);

    await redeliver(entity, withRow(change, { tax_authority_last_authorized_number: 9 }));
    expect(column(table, "tax_authority_last_authorized_number")).toBe(12);

    await redeliver(entity, withRow(change, { tax_authority_last_authorized_number: 15 }));
    expect(column(table, "tax_authority_last_authorized_number")).toBe(15);
  });
});
