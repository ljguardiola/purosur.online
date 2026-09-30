import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { openLocalDatabase } from "./local-database";
import { LOCAL_MIGRATIONS } from "./local-migrations";

const MIGRATIONS_FOLDER = fileURLToPath(new URL("../migrations/", import.meta.url));

describe("the register's local migrations", () => {
  it("are every SQL file of the migrations folder, named without its extension, in order", () => {
    const files = readdirSync(MIGRATIONS_FOLDER)
      .filter((file) => file.endsWith(".sql"))
      .sort();

    expect(LOCAL_MIGRATIONS).toEqual(
      files.map((file) => ({
        name: file.replace(/\.sql$/, ""),
        sql: readFileSync(`${MIGRATIONS_FOLDER}${file}`, "utf8"),
      })),
    );
    expect(files.length).toBeGreaterThan(0);
  });

  it("add the catalog and prices over the branch settings and cursor a register already holds", () => {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const path = join(folder, "register.sqlite");
      const [first] = LOCAL_MIGRATIONS;
      if (first === undefined) {
        throw new Error("test setup: no local migration");
      }
      const before = openLocalDatabase(path, [first]);
      before
        .prepare("UPDATE sync_state SET pull_cursor = 7, device_id = 'device-a' WHERE id = 1")
        .run();
      before
        .prepare(
          `INSERT INTO branch_settings (
             location_id, address, whatsapp_number, instagram_handle, weekly_hours,
             expiring_lot_alert_days, unreviewed_price_alert_days, good_condition_return_days, version
           ) VALUES ('location', 'Av. Belgrano 1450', '', '', '{}', 30, 30, 15, 4)`,
        )
        .run();
      before.close();

      const after = openLocalDatabase(path, LOCAL_MIGRATIONS);

      expect(after.prepare("SELECT pull_cursor, device_id FROM sync_state").all()).toEqual([
        { pull_cursor: 7, device_id: "device-a" },
      ]);
      expect(after.prepare("SELECT address, version FROM branch_settings").all()).toEqual([
        { address: "Av. Belgrano 1450", version: 4 },
      ]);
      const tables = after
        .prepare<[], { name: string }>(
          `SELECT name FROM sqlite_schema WHERE type = 'table'
             AND name IN ('categories', 'products', 'product_barcodes', 'price_lists', 'prices')
           ORDER BY name`,
        )
        .all();
      expect(tables.map((table) => table.name)).toEqual([
        "categories",
        "price_lists",
        "prices",
        "product_barcodes",
        "products",
      ]);
      after.close();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("add the users, roles and PIN verifiers over the catalog and cursor a register already holds", () => {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const path = join(folder, "register.sqlite");
      const [first, second] = LOCAL_MIGRATIONS;
      if (first === undefined || second === undefined) {
        throw new Error("test setup: fewer than two local migrations");
      }
      const before = openLocalDatabase(path, [first, second]);
      before
        .prepare("UPDATE sync_state SET pull_cursor = 9, device_id = 'device-a' WHERE id = 1")
        .run();
      before
        .prepare("INSERT INTO tags (id, name, active, version) VALUES ('tag', 'Vegano', 1, 2)")
        .run();
      before.close();

      const after = openLocalDatabase(path, LOCAL_MIGRATIONS);

      expect(after.prepare("SELECT pull_cursor, device_id FROM sync_state").all()).toEqual([
        { pull_cursor: 9, device_id: "device-a" },
      ]);
      expect(after.prepare("SELECT name, version FROM tags").all()).toEqual([
        { name: "Vegano", version: 2 },
      ]);
      const tables = after
        .prepare<[], { name: string }>(
          `SELECT name FROM sqlite_schema WHERE type = 'table'
             AND name IN ('users', 'roles', 'role_permissions', 'pin_verifiers')
           ORDER BY name`,
        )
        .all();
      expect(tables.map((table) => table.name)).toEqual([
        "pin_verifiers",
        "role_permissions",
        "roles",
        "users",
      ]);
      after.close();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("add the register's own row over the users and cursor a register already holds", () => {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const path = join(folder, "register.sqlite");
      const [first, second, third] = LOCAL_MIGRATIONS;
      if (first === undefined || second === undefined || third === undefined) {
        throw new Error("test setup: fewer than three local migrations");
      }
      const before = openLocalDatabase(path, [first, second, third]);
      before
        .prepare("UPDATE sync_state SET pull_cursor = 11, device_id = 'device-a' WHERE id = 1")
        .run();
      before
        .prepare(
          "INSERT INTO roles (id, name, is_administrator, version) VALUES ('role', 'Cajera', 0, 2)",
        )
        .run();
      before.close();

      const after = openLocalDatabase(path, LOCAL_MIGRATIONS);

      expect(after.prepare("SELECT pull_cursor, device_id FROM sync_state").all()).toEqual([
        { pull_cursor: 11, device_id: "device-a" },
      ]);
      expect(after.prepare("SELECT name, version FROM roles").all()).toEqual([
        { name: "Cajera", version: 2 },
      ]);
      expect(after.prepare("SELECT id FROM own_register").all()).toEqual([]);
      after.close();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("add the PIN sign-in failures over the users and verifiers a register already holds", () => {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const path = join(folder, "register.sqlite");
      const previous = LOCAL_MIGRATIONS.slice(0, 4);
      const before = openLocalDatabase(path, previous);
      before
        .prepare(
          "INSERT INTO users (id, first_name, role_id, salt, active, version) VALUES ('u1', 'Ada', 'role', 'salt', 1, 3)",
        )
        .run();
      before.prepare("INSERT INTO pin_verifiers (user_id, verifier) VALUES ('u1', 'v')").run();
      before.close();

      const after = openLocalDatabase(path, LOCAL_MIGRATIONS);

      expect(after.prepare("SELECT first_name, version FROM users").all()).toEqual([
        { first_name: "Ada", version: 3 },
      ]);
      expect(after.prepare("SELECT user_id FROM pin_verifiers").all()).toEqual([{ user_id: "u1" }]);
      expect(after.prepare("SELECT user_id FROM pin_sign_in_failures").all()).toEqual([]);
      after.close();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("add the remembered users over the users and verifiers a register already holds", () => {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const path = join(folder, "register.sqlite");
      const previous = LOCAL_MIGRATIONS.slice(0, 7);
      const before = openLocalDatabase(path, previous);
      before
        .prepare(
          "INSERT INTO users (id, first_name, role_id, salt, active, version) VALUES ('u1', 'Ada', 'role', 'salt', 1, 3)",
        )
        .run();
      before.prepare("INSERT INTO pin_verifiers (user_id, verifier) VALUES ('u1', 'v')").run();
      before.close();

      const after = openLocalDatabase(path, LOCAL_MIGRATIONS);

      expect(after.prepare("SELECT first_name, version FROM users").all()).toEqual([
        { first_name: "Ada", version: 3 },
      ]);
      expect(after.prepare("SELECT user_id FROM pin_verifiers").all()).toEqual([{ user_id: "u1" }]);
      expect(after.prepare("SELECT user_id FROM remembered_users").all()).toEqual([]);
      after.close();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("add cash sessions, cash movements and the outbox over the sync state a register already holds", () => {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const path = join(folder, "register.sqlite");
      const previous = LOCAL_MIGRATIONS.slice(0, 5);
      const before = openLocalDatabase(path, previous);
      before
        .prepare("UPDATE sync_state SET pull_cursor = 13, device_id = 'device-a' WHERE id = 1")
        .run();
      before.close();

      const after = openLocalDatabase(path, LOCAL_MIGRATIONS);

      expect(
        after
          .prepare(
            "SELECT pull_cursor, device_id, last_device_seq, last_chain_hmac FROM sync_state",
          )
          .all(),
      ).toEqual([
        { pull_cursor: 13, device_id: "device-a", last_device_seq: 0, last_chain_hmac: null },
      ]);
      for (const table of ["cash_sessions", "cash_movements", "outbox"]) {
        expect(after.prepare(`SELECT count(*) AS total FROM ${table}`).get()).toEqual({ total: 0 });
      }
      after.close();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("add the discounts over the pull cursor and users a register already holds", () => {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const path = join(folder, "register.sqlite");
      const previous = LOCAL_MIGRATIONS.slice(0, 6);
      const before = openLocalDatabase(path, previous);
      before
        .prepare("UPDATE sync_state SET pull_cursor = 14, device_id = 'device-a' WHERE id = 1")
        .run();
      before
        .prepare(
          "INSERT INTO users (id, first_name, role_id, salt, active, version) VALUES ('u1', 'Ada', 'role', 'salt', 1, 3)",
        )
        .run();
      before.close();

      const after = openLocalDatabase(path, LOCAL_MIGRATIONS);

      expect(after.prepare("SELECT pull_cursor, device_id FROM sync_state").all()).toEqual([
        { pull_cursor: 14, device_id: "device-a" },
      ]);
      expect(after.prepare("SELECT first_name, version FROM users").all()).toEqual([
        { first_name: "Ada", version: 3 },
      ]);
      expect(after.prepare("SELECT id FROM discounts").all()).toEqual([]);
      after.close();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("add the buy-N-pay-M quantities over the discounts a register already holds", () => {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const path = join(folder, "register.sqlite");
      const previous = LOCAL_MIGRATIONS.slice(0, 8);
      const before = openLocalDatabase(path, previous);
      before
        .prepare(
          `INSERT INTO discounts (
             id, name, kind, percent, target_kind, target_id, valid_from, valid_to, weekdays, active, version
           ) VALUES ('d1', 'Martes', 'PERCENT_OFF', 10, 'TAG', 't', '2026-10-01', '2026-10-31', '[2]', 1, 4)`,
        )
        .run();
      before.close();

      const after = openLocalDatabase(path, LOCAL_MIGRATIONS);

      expect(
        after.prepare("SELECT id, kind, percent, buy_qty, pay_qty, version FROM discounts").all(),
      ).toEqual([
        { id: "d1", kind: "PERCENT_OFF", percent: 10, buy_qty: null, pay_qty: null, version: 4 },
      ]);
      after.close();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("hold a discount of a kind and a percent a later migration may extend without a rewrite", () => {
    const database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS);
    const insert = database.prepare(
      `INSERT INTO discounts (
         id, name, kind, percent, target_kind, target_id, valid_from, valid_to, weekdays, active, version
       ) VALUES (@id, 'Promo', @kind, @percent, 'TAG', 't', '2026-10-01', '2026-10-31', '[]', 1, 1)`,
    );

    insert.run({ id: "percent", kind: "PERCENT_OFF", percent: 10 });
    insert.run({ id: "another-kind", kind: "BUY_N_PAY_M", percent: null });

    expect(database.prepare("SELECT id, kind, percent FROM discounts ORDER BY id").all()).toEqual([
      { id: "another-kind", kind: "BUY_N_PAY_M", percent: null },
      { id: "percent", kind: "PERCENT_OFF", percent: 10 },
    ]);
    database.close();
  });

  it("add sales and the installation's revocation over the cash sessions, discounts and pull cursor a register already holds", () => {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const path = join(folder, "register.sqlite");
      const previous = LOCAL_MIGRATIONS.slice(0, 9);
      expect(previous.at(-1)?.name).toBe("0008_buy_n_pay_m_discounts");
      expect(LOCAL_MIGRATIONS.at(previous.length)?.name).toBe("0009_sales");
      const before = openLocalDatabase(path, previous);
      before
        .prepare("UPDATE sync_state SET pull_cursor = 15, device_id = 'device-a' WHERE id = 1")
        .run();
      before
        .prepare(
          `INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
           VALUES ('s1', 'r1', 'device-a', 'u1', '2026-09-30T12:00:00.000Z', 0, 'OPEN')`,
        )
        .run();
      before
        .prepare(
          `INSERT INTO discounts (
             id, name, kind, percent, buy_qty, pay_qty, target_kind, target_id, valid_from, valid_to, weekdays, active, version
           ) VALUES ('d1', '3x2', 'BUY_N_PAY_M', NULL, 3, 2, 'TAG', 't', '2026-10-01', '2026-10-31', '[]', 1, 2)`,
        )
        .run();
      before.close();

      const after = openLocalDatabase(path, LOCAL_MIGRATIONS);

      expect(after.prepare("SELECT id, buy_qty, pay_qty FROM discounts").all()).toEqual([
        { id: "d1", buy_qty: 3, pay_qty: 2 },
      ]);
      expect(
        after
          .prepare("SELECT pull_cursor, device_id, installation_revoked_at FROM sync_state")
          .all(),
      ).toEqual([{ pull_cursor: 15, device_id: "device-a", installation_revoked_at: null }]);
      expect(after.prepare("SELECT id, state FROM cash_sessions").all()).toEqual([
        { id: "s1", state: "OPEN" },
      ]);
      for (const table of ["sales", "sale_lines"]) {
        expect(after.prepare(`SELECT count(*) AS total FROM ${table}`).get()).toEqual({ total: 0 });
      }
      after.close();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("find the lines of a product without reading every line, keeping the sales a register already holds", () => {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const path = join(folder, "register.sqlite");
      const previous = LOCAL_MIGRATIONS.slice(0, 10);
      expect(previous.at(-1)?.name).toBe("0009_sales");
      expect(LOCAL_MIGRATIONS.slice(previous.length).map((migration) => migration.name)).toEqual([
        "0010_sale_lines_by_product",
      ]);
      const before = openLocalDatabase(path, previous);
      before
        .prepare(
          `INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
           VALUES ('s1', 'r1', 'device-a', 'u1', '2026-09-30T12:00:00.000Z', 0, 'OPEN')`,
        )
        .run();
      before
        .prepare(
          `INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at)
           VALUES ('a', 'r1', 'device-a', 's1', 'u1', 'COMPLETED', '2026-09-30T12:00:00.000Z')`,
        )
        .run();
      before
        .prepare(
          `INSERT INTO sale_lines (id, sale_id, position, product_id, product_name, quantity, list_unit_price, price_list_id, line_total)
           VALUES ('l1', 'a', 1, 'p1', 'Yerba', 2, 1000, 'pl', 2000)`,
        )
        .run();
      before.close();

      const after = openLocalDatabase(path, LOCAL_MIGRATIONS);

      expect(after.prepare("SELECT id, product_id, quantity FROM sale_lines").all()).toEqual([
        { id: "l1", product_id: "p1", quantity: 2 },
      ]);
      const plan = after
        .prepare<[], { detail: string }>(
          `EXPLAIN QUERY PLAN SELECT products.id,
             (SELECT count(*) FROM sale_lines
              JOIN sales ON sales.id = sale_lines.sale_id
              WHERE sale_lines.product_id = products.id AND sales.state = 'COMPLETED'
                AND sales.register_id IN (SELECT id FROM own_register WHERE removed = 0)
             )
           FROM products`,
        )
        .all()
        .map((step) => step.detail);
      expect(plan.join("\n")).toMatch(/SEARCH sale_lines .*\(product_id=\?\)/);
      after.close();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  describe("hold sales that", () => {
    function insertSale(
      database: ReturnType<typeof openLocalDatabase>,
      id: string,
      state: string,
      sessionId = "s1",
    ) {
      database
        .prepare(
          `INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at)
           VALUES (?, 'r1', 'device-a', ?, 'u1', ?, '2026-09-30T12:00:00.000Z')`,
        )
        .run(id, sessionId, state);
    }

    function withSession() {
      const database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS);
      database
        .prepare(
          `INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
           VALUES ('s1', 'r1', 'device-a', 'u1', '2026-09-30T12:00:00.000Z', 0, 'OPEN')`,
        )
        .run();
      return database;
    }

    it("are at most one open per session, while any number of finished ones stay", () => {
      const database = withSession();
      insertSale(database, "a", "COMPLETED");
      insertSale(database, "b", "CANCELLED");
      insertSale(database, "c", "OPEN");

      expect(() => insertSale(database, "d", "OPEN")).toThrow(/UNIQUE/);
      database.close();
    });

    it("are in a known state and belong to a known session", () => {
      const database = withSession();

      expect(() => insertSale(database, "a", "PENDING")).toThrow(/CHECK/);
      expect(() => insertSale(database, "b", "OPEN", "missing")).toThrow(/FOREIGN KEY/);
      database.close();
    });

    it("hold one line per product with a positive quantity", () => {
      const database = withSession();
      insertSale(database, "a", "OPEN");
      const insertLine = database.prepare(
        `INSERT INTO sale_lines (id, sale_id, position, product_id, product_name, quantity, list_unit_price, price_list_id, line_total)
         VALUES (@id, 'a', @position, @product_id, 'Yerba', @quantity, 1000, 'pl', 1000)`,
      );
      insertLine.run({ id: "l1", position: 1, product_id: "p1", quantity: 1 });

      expect(() =>
        insertLine.run({ id: "l2", position: 2, product_id: "p1", quantity: 1 }),
      ).toThrow(/UNIQUE/);
      expect(() =>
        insertLine.run({ id: "l3", position: 3, product_id: "p2", quantity: 0 }),
      ).toThrow(/CHECK/);
      database.close();
    });
  });
});
