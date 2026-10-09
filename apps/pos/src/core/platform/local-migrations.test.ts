import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFERRAL_REASONS } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { LOCAL_MIGRATIONS } from "./local-migrations";
import { migrationClock } from "./test-support/migration-clock";
import { openLocalDatabase } from "./test-support/open-local-database";

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
      const before = openLocalDatabase(path, [first], migrationClock);
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

      const after = openLocalDatabase(path, LOCAL_MIGRATIONS, migrationClock);

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
      const before = openLocalDatabase(path, [first, second], migrationClock);
      before
        .prepare("UPDATE sync_state SET pull_cursor = 9, device_id = 'device-a' WHERE id = 1")
        .run();
      before
        .prepare("INSERT INTO tags (id, name, active, version) VALUES ('tag', 'Vegano', 1, 2)")
        .run();
      before.close();

      const after = openLocalDatabase(path, LOCAL_MIGRATIONS, migrationClock);

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
      const before = openLocalDatabase(path, [first, second, third], migrationClock);
      before
        .prepare("UPDATE sync_state SET pull_cursor = 11, device_id = 'device-a' WHERE id = 1")
        .run();
      before
        .prepare(
          "INSERT INTO roles (id, name, is_administrator, version) VALUES ('role', 'Cajera', 0, 2)",
        )
        .run();
      before.close();

      const after = openLocalDatabase(path, LOCAL_MIGRATIONS, migrationClock);

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
      const before = openLocalDatabase(path, previous, migrationClock);
      before
        .prepare(
          "INSERT INTO users (id, first_name, role_id, salt, active, version) VALUES ('u1', 'Ada', 'role', 'salt', 1, 3)",
        )
        .run();
      before.prepare("INSERT INTO pin_verifiers (user_id, verifier) VALUES ('u1', 'v')").run();
      before.close();

      const after = openLocalDatabase(path, LOCAL_MIGRATIONS, migrationClock);

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
      const before = openLocalDatabase(path, previous, migrationClock);
      before
        .prepare(
          "INSERT INTO users (id, first_name, role_id, salt, active, version) VALUES ('u1', 'Ada', 'role', 'salt', 1, 3)",
        )
        .run();
      before.prepare("INSERT INTO pin_verifiers (user_id, verifier) VALUES ('u1', 'v')").run();
      before.close();

      const after = openLocalDatabase(path, LOCAL_MIGRATIONS, migrationClock);

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
      const before = openLocalDatabase(path, previous, migrationClock);
      before
        .prepare("UPDATE sync_state SET pull_cursor = 13, device_id = 'device-a' WHERE id = 1")
        .run();
      before.close();

      const after = openLocalDatabase(path, LOCAL_MIGRATIONS, migrationClock);

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
      const before = openLocalDatabase(path, previous, migrationClock);
      before
        .prepare("UPDATE sync_state SET pull_cursor = 14, device_id = 'device-a' WHERE id = 1")
        .run();
      before
        .prepare(
          "INSERT INTO users (id, first_name, role_id, salt, active, version) VALUES ('u1', 'Ada', 'role', 'salt', 1, 3)",
        )
        .run();
      before.close();

      const after = openLocalDatabase(path, LOCAL_MIGRATIONS, migrationClock);

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
      const before = openLocalDatabase(path, previous, migrationClock);
      before
        .prepare(
          `INSERT INTO discounts (
             id, name, kind, percent, target_kind, target_id, valid_from, valid_to, weekdays, active, version
           ) VALUES ('d1', 'Martes', 'PERCENT_OFF', 10, 'TAG', 't', '2026-10-01', '2026-10-31', '[2]', 1, 4)`,
        )
        .run();
      before.close();

      const after = openLocalDatabase(path, LOCAL_MIGRATIONS, migrationClock);

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
    const database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
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
      const before = openLocalDatabase(path, previous, migrationClock);
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

      const after = openLocalDatabase(path, LOCAL_MIGRATIONS, migrationClock);

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

  it("add the promotion of each sale line over the open sales a register already holds", () => {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const path = join(folder, "register.sqlite");
      const previous = LOCAL_MIGRATIONS.slice(0, 10);
      expect(previous.at(-1)?.name).toBe("0009_sales");
      expect(LOCAL_MIGRATIONS.at(previous.length)?.name).toBe("0010_sale_line_promotions");
      const before = openLocalDatabase(path, previous, migrationClock);
      before
        .prepare(
          `INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
           VALUES ('s1', 'r1', 'device-a', 'u1', '2026-09-30T12:00:00.000Z', 0, 'OPEN')`,
        )
        .run();
      before
        .prepare(
          `INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at)
           VALUES ('a', 'r1', 'device-a', 's1', 'u1', 'OPEN', '2026-09-30T12:00:00.000Z')`,
        )
        .run();
      before
        .prepare(
          `INSERT INTO sale_lines (id, sale_id, position, product_id, product_name, quantity, list_unit_price, price_list_id, line_total)
           VALUES ('l1', 'a', 1, 'p1', 'Yerba', 2, 1000, 'pl', 2000)`,
        )
        .run();
      before.close();

      const after = openLocalDatabase(path, LOCAL_MIGRATIONS, migrationClock);

      expect(
        after.prepare("SELECT id, line_total, promotion_id, discount_amount FROM sale_lines").all(),
      ).toEqual([{ id: "l1", line_total: 2000, promotion_id: null, discount_amount: 0 }]);
      expect(after.prepare("SELECT count(*) AS total FROM sale_line_promotions").get()).toEqual({
        total: 0,
      });
      after.close();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("add the removals of sale lines over the open sales a register already holds", () => {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const path = join(folder, "register.sqlite");
      const previous = LOCAL_MIGRATIONS.slice(0, 13);
      expect(previous.at(-1)?.name).toBe("0012_payment_transactions");
      const withRemovals = LOCAL_MIGRATIONS.slice(0, 14);
      expect(withRemovals.at(-1)?.name).toBe("0013_sale_line_removals");
      const before = openLocalDatabase(path, previous, migrationClock);
      before
        .prepare(
          `INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
           VALUES ('s1', 'r1', 'device-a', 'u1', '2026-09-30T12:00:00.000Z', 0, 'OPEN')`,
        )
        .run();
      before
        .prepare(
          `INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at)
           VALUES ('a', 'r1', 'device-a', 's1', 'u1', 'OPEN', '2026-09-30T12:00:00.000Z')`,
        )
        .run();
      before.close();

      const after = openLocalDatabase(path, withRemovals, migrationClock);

      expect(after.prepare("SELECT id, state FROM sales").all()).toEqual([
        { id: "a", state: "OPEN" },
      ]);
      expect(after.prepare("SELECT count(*) AS total FROM sale_line_removals").get()).toEqual({
        total: 0,
      });
      after.close();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("let a payment be a transfer, keeping the cash payments a register already holds", () => {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const path = join(folder, "register.sqlite");
      const previous = LOCAL_MIGRATIONS.slice(0, 18);
      expect(previous.at(-1)?.name).toBe("0017_completed_sales_only");
      expect(LOCAL_MIGRATIONS.at(previous.length)?.name).toBe("0018_transfer_payments");
      const before = openLocalDatabase(path, previous, migrationClock);
      before
        .prepare(
          `INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
           VALUES ('s1', 'r1', 'device-a', 'u1', '2026-09-30T12:00:00.000Z', 0, 'OPEN')`,
        )
        .run();
      before
        .prepare(
          `INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at)
           VALUES ('sale-1', 'r1', 'device-a', 's1', 'u1', 'COMPLETED', '2026-09-30T12:05:00.000Z')`,
        )
        .run();
      before
        .prepare(
          `INSERT INTO payment_transactions (id, sale_id, kind, method, provider, amount, tendered, state, occurred_at)
           VALUES ('p1', 'sale-1', 'SALE', 'CASH', 'NONE', 1500, 2000, 'APPROVED', '2026-09-30T12:06:00.000Z')`,
        )
        .run();
      before.close();

      const after = openLocalDatabase(path, LOCAL_MIGRATIONS, migrationClock);

      expect(
        after
          .prepare(
            "SELECT id, sale_id, method, amount, tendered, authorized_by, confirmed_at FROM payment_transactions",
          )
          .all(),
      ).toEqual([
        {
          id: "p1",
          sale_id: "sale-1",
          method: "CASH",
          amount: 1500,
          tendered: 2000,
          authorized_by: null,
          confirmed_at: null,
        },
      ]);
      const insertTransfer = after.prepare(
        `INSERT INTO payment_transactions (id, sale_id, kind, method, provider, amount, tendered, authorized_by, confirmed_at, state, occurred_at)
         VALUES (@id, 'sale-1', 'SALE', @method, 'NONE', 900, @tendered, @authorized_by, @confirmed_at, 'APPROVED', '2026-09-30T12:07:00.000Z')`,
      );
      const transfer = {
        id: "p2",
        method: "TRANSFER",
        tendered: null,
        authorized_by: "u1",
        confirmed_at: "2026-09-30T12:07:00.000Z",
      };
      insertTransfer.run(transfer);
      expect(after.prepare("SELECT count(*) AS total FROM payment_transactions").get()).toEqual({
        total: 2,
      });
      expect(after.pragma("foreign_key_check")).toEqual([]);
      expect(() => insertTransfer.run({ ...transfer, id: "p3", authorized_by: null })).toThrow();
      expect(() => insertTransfer.run({ ...transfer, id: "p4", confirmed_at: null })).toThrow();
      expect(() => insertTransfer.run({ ...transfer, id: "p5", tendered: 900 })).toThrow();
      expect(() =>
        insertTransfer.run({ ...transfer, id: "p6", method: "CASH", tendered: 900 }),
      ).toThrow();
      after.close();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("find the lines of a product without reading every line, keeping the sales a register already holds", () => {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const path = join(folder, "register.sqlite");
      const previous = LOCAL_MIGRATIONS.slice(0, 11);
      expect(previous.at(-1)?.name).toBe("0010_sale_line_promotions");
      expect(LOCAL_MIGRATIONS.at(previous.length)?.name).toBe("0011_sale_lines_by_product");
      const before = openLocalDatabase(path, previous, migrationClock);
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

      const after = openLocalDatabase(path, LOCAL_MIGRATIONS, migrationClock);

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

  it("add payment transactions over the open sale and cash movements a register already holds", () => {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const path = join(folder, "register.sqlite");
      const previous = LOCAL_MIGRATIONS.slice(0, 12);
      expect(previous.at(-1)?.name).toBe("0011_sale_lines_by_product");
      expect(LOCAL_MIGRATIONS.slice(previous.length)[0]?.name).toBe("0012_payment_transactions");
      const before = openLocalDatabase(path, previous, migrationClock);
      before
        .prepare(
          `INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
           VALUES ('s1', 'r1', 'device-a', 'u1', '2026-09-30T12:00:00.000Z', 500, 'OPEN')`,
        )
        .run();
      before
        .prepare(
          `INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at)
           VALUES ('sale-1', 'r1', 'device-a', 's1', 'u1', 'OPEN', '2026-09-30T12:05:00.000Z')`,
        )
        .run();
      before
        .prepare(
          `INSERT INTO cash_movements (id, session_id, type, amount, actor_id, occurred_at)
           VALUES ('m1', 's1', 'OPENING', 500, 'u1', '2026-09-30T12:00:00.000Z')`,
        )
        .run();
      before.close();

      const after = openLocalDatabase(path, LOCAL_MIGRATIONS, migrationClock);

      expect(after.prepare("SELECT id, state FROM sales").all()).toEqual([
        { id: "sale-1", state: "OPEN" },
      ]);
      expect(after.prepare("SELECT id, type, amount FROM cash_movements").all()).toEqual([
        { id: "m1", type: "OPENING", amount: 500 },
      ]);
      expect(after.prepare("SELECT count(*) AS total FROM payment_transactions").get()).toEqual({
        total: 0,
      });
      after.close();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  describe("hold payment transactions that", () => {
    function withOpenSale() {
      const database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
      database
        .prepare(
          `INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
           VALUES ('s1', 'r1', 'device-a', 'u1', '2026-09-30T12:00:00.000Z', 0, 'OPEN')`,
        )
        .run();
      database
        .prepare(
          `INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at)
           VALUES ('sale-1', 'r1', 'device-a', 's1', 'u1', 'OPEN', NULL)`,
        )
        .run();
      return database;
    }

    function insertPayment(
      database: ReturnType<typeof openLocalDatabase>,
      overrides: Record<string, string | number | null> = {},
    ) {
      database
        .prepare(
          `INSERT INTO payment_transactions (id, sale_id, kind, method, provider, amount, tendered, state, occurred_at)
           VALUES (@id, @sale_id, @kind, @method, @provider, @amount, @tendered, @state, @occurred_at)`,
        )
        .run({
          id: "pay-1",
          sale_id: "sale-1",
          kind: "SALE",
          method: "CASH",
          provider: "NONE",
          amount: 1500,
          tendered: 2000,
          state: "APPROVED",
          occurred_at: "2026-09-30T12:06:00.000Z",
          ...overrides,
        });
    }

    it("keep the amount applied and, for cash, the amount tendered", () => {
      const database = withOpenSale();

      insertPayment(database);

      expect(database.prepare("SELECT amount, tendered FROM payment_transactions").all()).toEqual([
        { amount: 1500, tendered: 2000 },
      ]);
      database.close();
    });

    it("belong to a known sale and hold a known kind, method and state", () => {
      const database = withOpenSale();

      expect(() => insertPayment(database, { sale_id: "missing" })).toThrow(/FOREIGN KEY/);
      expect(() => insertPayment(database, { kind: "REFUND" })).toThrow(/CHECK/);
      expect(() => insertPayment(database, { method: "CARD" })).toThrow(/CHECK/);
      expect(() => insertPayment(database, { state: "PENDING" })).toThrow(/CHECK/);
      database.close();
    });

    it("hold a positive amount and a tendered amount that covers it", () => {
      const database = withOpenSale();

      expect(() => insertPayment(database, { amount: 0 })).toThrow(/CHECK/);
      expect(() => insertPayment(database, { amount: 1500, tendered: 1000 })).toThrow(/CHECK/);
      database.close();
    });
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
           VALUES (?, 'r1', 'device-a', ?, 'u1', ?, ?)`,
        )
        .run(id, sessionId, state, state === "OPEN" ? null : "2026-09-30T12:00:00.000Z");
    }

    function withSession() {
      const database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
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
      insertSale(database, "b", "VOIDED");
      insertSale(database, "e", "CANCELLED");
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

    describe("freeze the promotions of a line that", () => {
      function withLine() {
        const database = withSession();
        insertSale(database, "a", "OPEN");
        database
          .prepare(
            `INSERT INTO sale_lines (id, sale_id, position, product_id, product_name, quantity, list_unit_price, price_list_id, line_total)
             VALUES ('l1', 'a', 1, 'p1', 'Yerba', 1, 1000, 'pl', 1000)`,
          )
          .run();
        return database;
      }

      function freeze(
        database: ReturnType<typeof openLocalDatabase>,
        values: Partial<{
          line_id: string;
          discount_id: string;
          kind: string;
          percent: number | null;
          buy_qty: number | null;
          pay_qty: number | null;
        }>,
      ) {
        database
          .prepare(
            `INSERT INTO sale_line_promotions (line_id, discount_id, kind, percent, buy_qty, pay_qty)
             VALUES (@line_id, @discount_id, @kind, @percent, @buy_qty, @pay_qty)`,
          )
          .run({
            line_id: "l1",
            discount_id: "d1",
            kind: "PERCENT_OFF",
            percent: 10,
            buy_qty: null,
            pay_qty: null,
            ...values,
          });
      }

      it("belongs to a known line and holds each discount once", () => {
        const database = withLine();
        freeze(database, {});

        expect(() => freeze(database, {})).toThrow(/UNIQUE/);
        expect(() => freeze(database, { line_id: "missing" })).toThrow(/FOREIGN KEY/);
        database.close();
      });

      it("holds a percent from 1 to 99 and nothing of the other kind", () => {
        const database = withLine();

        freeze(database, { discount_id: "low", percent: 1 });
        freeze(database, { discount_id: "high", percent: 99 });
        for (const [discount_id, values] of [
          ["zero", { percent: 0 }],
          ["full", { percent: 100 }],
          ["missing", { percent: null }],
          ["with-quantities", { buy_qty: 3, pay_qty: 2 }],
        ] as const) {
          expect(() => freeze(database, { discount_id, ...values })).toThrow(/CHECK/);
        }
        database.close();
      });

      it("holds a buy quantity above a pay quantity of at least 1 and nothing of the other kind", () => {
        const database = withLine();
        const buyNPayM = { kind: "BUY_N_PAY_M", percent: null };

        freeze(database, { discount_id: "ok", ...buyNPayM, buy_qty: 3, pay_qty: 2 });
        for (const [discount_id, values] of [
          ["equal", { buy_qty: 2, pay_qty: 2 }],
          ["free", { buy_qty: 2, pay_qty: 0 }],
          ["no-buy", { buy_qty: null, pay_qty: 1 }],
          ["no-pay", { buy_qty: 3, pay_qty: null }],
          ["with-percent", { percent: 10, buy_qty: 3, pay_qty: 2 }],
        ] as const) {
          expect(() => freeze(database, { discount_id, ...buyNPayM, ...values })).toThrow(/CHECK/);
        }
        database.close();
      });

      it("is of a known kind", () => {
        const database = withLine();

        expect(() => freeze(database, { kind: "TWO_FOR_ONE" })).toThrow(/CHECK/);
        database.close();
      });

      it("never charges a negative discount", () => {
        const database = withLine();

        expect(() => database.prepare("UPDATE sale_lines SET discount_amount = -1").run()).toThrow(
          /CHECK/,
        );
        database.close();
      });
    });
  });

  it("add the fiscal configuration over the sales and pull cursor a register already holds", () => {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const path = join(folder, "register.sqlite");
      const previous = LOCAL_MIGRATIONS.slice(0, 14);
      expect(previous.at(-1)?.name).toBe("0013_sale_line_removals");
      expect(LOCAL_MIGRATIONS.slice(previous.length).map((migration) => migration.name)).toEqual([
        "0014_fiscal_configuration",
        "0015_pre_emission_gate_outcomes",
        "0016_register_point_of_sale",
        "0017_completed_sales_only",
        "0018_transfer_payments",
        "0019_sales_dated_when_charged",
        "0020_cancelled_sales_and_refunds",
        "0021_real_time_authorization",
        "0022_threshold_revisions",
        "0023_sales_stopped_reason",
        "0024_stock_ledger",
        "0025_last_accepted_push",
        "0026_receipt_printing",
      ]);
      const before = openLocalDatabase(path, previous, migrationClock);
      before
        .prepare("UPDATE sync_state SET pull_cursor = 16, device_id = 'device-a' WHERE id = 1")
        .run();
      before
        .prepare(
          `INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
           VALUES ('s1', 'r1', 'device-a', 'u1', '2026-09-30T12:00:00.000Z', 0, 'OPEN')`,
        )
        .run();
      before.close();

      const after = openLocalDatabase(path, LOCAL_MIGRATIONS, migrationClock);

      expect(after.prepare("SELECT pull_cursor, device_id FROM sync_state").all()).toEqual([
        { pull_cursor: 16, device_id: "device-a" },
      ]);
      expect(after.prepare("SELECT id, state FROM cash_sessions").all()).toEqual([
        { id: "s1", state: "OPEN" },
      ]);
      for (const table of [
        "issuer_identification_versions",
        "buyer_identification_thresholds",
        "buyer_tax_status_sets",
      ]) {
        expect(after.prepare(`SELECT count(*) AS total FROM ${table}`).get()).toEqual({ total: 0 });
      }
      after.close();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("add the pre-emission gate outcomes over the completed sales a register already holds", () => {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const path = join(folder, "register.sqlite");
      const previous = LOCAL_MIGRATIONS.slice(0, 15);
      expect(previous.at(-1)?.name).toBe("0014_fiscal_configuration");
      expect(LOCAL_MIGRATIONS.slice(previous.length).map((migration) => migration.name)).toEqual([
        "0015_pre_emission_gate_outcomes",
        "0016_register_point_of_sale",
        "0017_completed_sales_only",
        "0018_transfer_payments",
        "0019_sales_dated_when_charged",
        "0020_cancelled_sales_and_refunds",
        "0021_real_time_authorization",
        "0022_threshold_revisions",
        "0023_sales_stopped_reason",
        "0024_stock_ledger",
        "0025_last_accepted_push",
        "0026_receipt_printing",
      ]);
      const before = openLocalDatabase(path, previous, migrationClock);
      before
        .prepare(
          `INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
           VALUES ('s1', 'r1', 'device-a', 'u1', '2026-09-30T12:00:00.000Z', 0, 'OPEN')`,
        )
        .run();
      before
        .prepare(
          `INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at)
           VALUES ('sale-1', 'r1', 'device-a', 's1', 'u1', 'COMPLETED', '2026-09-30T12:05:00.000Z')`,
        )
        .run();
      before.close();

      const after = openLocalDatabase(path, LOCAL_MIGRATIONS, migrationClock);

      expect(after.prepare("SELECT id, state FROM sales").all()).toEqual([
        { id: "sale-1", state: "COMPLETED" },
      ]);
      expect(
        after.prepare("SELECT count(*) AS total FROM pre_emission_gate_outcomes").get(),
      ).toEqual({ total: 0 });
      after.close();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("add the register's point of sale over the own register and fiscal configuration a register already holds", () => {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const path = join(folder, "register.sqlite");
      const previous = LOCAL_MIGRATIONS.slice(0, 16);
      expect(previous.at(-1)?.name).toBe("0015_pre_emission_gate_outcomes");
      expect(LOCAL_MIGRATIONS.slice(previous.length).map((migration) => migration.name)).toEqual([
        "0016_register_point_of_sale",
        "0017_completed_sales_only",
        "0018_transfer_payments",
        "0019_sales_dated_when_charged",
        "0020_cancelled_sales_and_refunds",
        "0021_real_time_authorization",
        "0022_threshold_revisions",
        "0023_sales_stopped_reason",
        "0024_stock_ledger",
        "0025_last_accepted_push",
        "0026_receipt_printing",
      ]);
      const before = openLocalDatabase(path, previous, migrationClock);
      before
        .prepare("INSERT INTO own_register (id, name, version) VALUES ('r1', 'Caja 1', 3)")
        .run();
      before
        .prepare(
          `INSERT INTO buyer_identification_thresholds (id, amount, valid_from)
           VALUES ('t1', 500000, '2026-01-01')`,
        )
        .run();
      before.close();

      const after = openLocalDatabase(path, LOCAL_MIGRATIONS, migrationClock);

      expect(after.prepare("SELECT id, name, version FROM own_register").all()).toEqual([
        { id: "r1", name: "Caja 1", version: 3 },
      ]);
      expect(after.prepare("SELECT id, amount FROM buyer_identification_thresholds").all()).toEqual(
        [{ id: "t1", amount: 500000 }],
      );
      expect(after.prepare("SELECT count(*) AS total FROM register_point_of_sale").get()).toEqual({
        total: 0,
      });
      after.close();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("keep only the open and completed sales and drop the removals over the sales a register already holds", () => {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const path = join(folder, "register.sqlite");
      const previous = LOCAL_MIGRATIONS.slice(0, 17);
      expect(previous.at(-1)?.name).toBe("0016_register_point_of_sale");
      expect(LOCAL_MIGRATIONS.slice(previous.length).map((migration) => migration.name)).toEqual([
        "0017_completed_sales_only",
        "0018_transfer_payments",
        "0019_sales_dated_when_charged",
        "0020_cancelled_sales_and_refunds",
        "0021_real_time_authorization",
        "0022_threshold_revisions",
        "0023_sales_stopped_reason",
        "0024_stock_ledger",
        "0025_last_accepted_push",
        "0026_receipt_printing",
      ]);
      const before = openLocalDatabase(path, previous, migrationClock);
      before.exec(
        `INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
         VALUES ('s1', 'r1', 'device-a', 'u1', '2026-09-30T12:00:00.000Z', 0, 'OPEN');
         INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at)
         VALUES ('done', 'r1', 'device-a', 's1', 'u1', 'COMPLETED', '2026-09-30T12:05:00.000Z'),
                ('dropped', 'r1', 'device-a', 's1', 'u1', 'CANCELLED', '2026-09-30T12:07:00.000Z'),
                ('open', 'r1', 'device-a', 's1', 'u1', 'OPEN', '2026-09-30T12:10:00.000Z');
         INSERT INTO sale_lines (id, sale_id, position, product_id, product_name, quantity, list_unit_price, price_list_id, line_total)
         VALUES ('l-done', 'done', 1, 'p1', 'Yerba', 1, 1000, 'pl', 1000),
                ('l-dropped', 'dropped', 1, 'p1', 'Yerba', 1, 1000, 'pl', 1000),
                ('l-open', 'open', 1, 'p1', 'Yerba', 1, 1000, 'pl', 1000);
         INSERT INTO sale_line_promotions (line_id, discount_id, kind, percent)
         VALUES ('l-done', 'ten', 'PERCENT_OFF', 10),
                ('l-dropped', 'ten', 'PERCENT_OFF', 10),
                ('l-open', 'ten', 'PERCENT_OFF', 10);
         INSERT INTO payment_transactions (id, sale_id, kind, method, provider, amount, tendered, state, occurred_at)
         VALUES ('pay-done', 'done', 'SALE', 'CASH', 'NONE', 1000, 1000, 'APPROVED', '2026-09-30T12:06:00.000Z');
         INSERT INTO pre_emission_gate_outcomes (sale_id, evaluated_at, outcome, document)
         VALUES ('done', '2026-09-30T12:06:00.000Z', 'PASSED', 'FACTURA_B');
         INSERT INTO sale_line_removals (id, sale_id, sale_line_id, product_id, qty_removed, amount_removed, actor_id, occurred_at)
         VALUES ('r-open', 'open', 'l-gone', 'p2', 1, 500, 'u1', '2026-09-30T12:11:00.000Z'),
                ('r-dropped', 'dropped', 'l-gone', 'p2', 1, 500, 'u1', '2026-09-29T12:06:00.000Z');`,
      );
      before.close();

      const after = openLocalDatabase(path, LOCAL_MIGRATIONS, migrationClock);

      expect(after.prepare("SELECT id, state FROM sales ORDER BY id").all()).toEqual([
        { id: "done", state: "COMPLETED" },
        { id: "open", state: "OPEN" },
      ]);
      expect(after.prepare("SELECT id, sale_id FROM sale_lines ORDER BY id").all()).toEqual([
        { id: "l-done", sale_id: "done" },
        { id: "l-open", sale_id: "open" },
      ]);
      expect(
        after.prepare("SELECT line_id FROM sale_line_promotions ORDER BY line_id").all(),
      ).toEqual([{ line_id: "l-done" }, { line_id: "l-open" }]);
      expect(after.prepare("SELECT id FROM payment_transactions").all()).toEqual([
        { id: "pay-done" },
      ]);
      expect(after.prepare("SELECT sale_id FROM pre_emission_gate_outcomes").all()).toEqual([
        { sale_id: "done" },
      ]);
      expect(
        after.prepare("SELECT name FROM sqlite_master WHERE name LIKE 'sale_line_removals%'").all(),
      ).toEqual([]);
      expect(after.pragma("foreign_key_check")).toEqual([]);
      expect(() => after.prepare("DELETE FROM sales WHERE id = 'done'").run()).toThrow(
        /FOREIGN KEY/,
      );
      after.close();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("date each completed sale with the moment of its payment and leave an open sale without a date over the sales a register already holds", () => {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const path = join(folder, "register.sqlite");
      const previous = LOCAL_MIGRATIONS.slice(0, 19);
      expect(previous.at(-1)?.name).toBe("0018_transfer_payments");
      expect(LOCAL_MIGRATIONS.slice(previous.length).map((migration) => migration.name)).toEqual([
        "0019_sales_dated_when_charged",
        "0020_cancelled_sales_and_refunds",
        "0021_real_time_authorization",
        "0022_threshold_revisions",
        "0023_sales_stopped_reason",
        "0024_stock_ledger",
        "0025_last_accepted_push",
        "0026_receipt_printing",
      ]);
      const before = openLocalDatabase(path, previous, migrationClock);
      before.exec(
        `INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
         VALUES ('s1', 'r1', 'device-a', 'u1', '2026-09-30T12:00:00.000Z', 0, 'OPEN');
         INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at)
         VALUES ('done', 'r1', 'device-a', 's1', 'u1', 'COMPLETED', '2026-09-30T23:58:00.000Z'),
                ('open', 'r1', 'device-a', 's1', 'u1', 'OPEN', '2026-10-01T00:10:00.000Z');
         INSERT INTO sale_lines (id, sale_id, position, product_id, product_name, quantity, list_unit_price, price_list_id, line_total)
         VALUES ('l-done', 'done', 1, 'p1', 'Yerba', 1, 1000, 'pl', 1000),
                ('l-open', 'open', 1, 'p1', 'Yerba', 1, 1000, 'pl', 1000);
         INSERT INTO payment_transactions (id, sale_id, kind, method, provider, amount, tendered, state, occurred_at)
         VALUES ('pay-done', 'done', 'SALE', 'CASH', 'NONE', 1000, 1000, 'APPROVED', '2026-10-01T00:02:00.000Z');`,
      );
      before.close();

      const after = openLocalDatabase(path, LOCAL_MIGRATIONS, migrationClock);

      expect(after.prepare("SELECT id, state, occurred_at FROM sales ORDER BY id").all()).toEqual([
        { id: "done", state: "COMPLETED", occurred_at: "2026-10-01T00:02:00.000Z" },
        { id: "open", state: "OPEN", occurred_at: null },
      ]);
      expect(after.prepare("SELECT id, sale_id FROM sale_lines ORDER BY id").all()).toEqual([
        { id: "l-done", sale_id: "done" },
        { id: "l-open", sale_id: "open" },
      ]);
      expect(after.prepare("SELECT id FROM payment_transactions").all()).toEqual([
        { id: "pay-done" },
      ]);
      expect(after.pragma("foreign_key_check")).toEqual([]);
      expect(() =>
        after
          .prepare(
            `INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at)
             VALUES ('second', 'r1', 'device-a', 's1', 'u1', 'OPEN', NULL)`,
          )
          .run(),
      ).toThrow(/UNIQUE/);
      expect(() =>
        after
          .prepare(
            `INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at)
             VALUES ('dated-open', 'r1', 'device-a', 's1', 'u1', 'COMPLETED', NULL)`,
          )
          .run(),
      ).toThrow(/CHECK/);
      after.close();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("let a sale be cancelled and hold the refunds of its payments over the sales a register already holds", () => {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const path = join(folder, "register.sqlite");
      const previous = LOCAL_MIGRATIONS.slice(0, 20);
      expect(previous.at(-1)?.name).toBe("0019_sales_dated_when_charged");
      expect(LOCAL_MIGRATIONS.slice(previous.length).map((migration) => migration.name)).toEqual([
        "0020_cancelled_sales_and_refunds",
        "0021_real_time_authorization",
        "0022_threshold_revisions",
        "0023_sales_stopped_reason",
        "0024_stock_ledger",
        "0025_last_accepted_push",
        "0026_receipt_printing",
      ]);
      const before = openLocalDatabase(path, previous, migrationClock);
      before.exec(
        `INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
         VALUES ('s1', 'r1', 'device-a', 'u1', '2026-09-30T12:00:00.000Z', 0, 'OPEN');
         INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at)
         VALUES ('done', 'r1', 'device-a', 's1', 'u1', 'COMPLETED', '2026-09-30T12:05:00.000Z'),
                ('open', 'r1', 'device-a', 's1', 'u1', 'OPEN', NULL);
         INSERT INTO sale_lines (id, sale_id, position, product_id, product_name, quantity, list_unit_price, price_list_id, line_total)
         VALUES ('l-done', 'done', 1, 'p1', 'Yerba', 1, 1000, 'pl', 1000),
                ('l-open', 'open', 1, 'p1', 'Yerba', 1, 1000, 'pl', 1000);
         INSERT INTO payment_transactions (id, sale_id, kind, method, provider, amount, tendered, state, occurred_at)
         VALUES ('pay-done', 'done', 'SALE', 'CASH', 'NONE', 1000, 1000, 'APPROVED', '2026-09-30T12:05:00.000Z'),
                ('pay-open', 'open', 'SALE', 'CASH', 'NONE', 400, 400, 'APPROVED', '2026-09-30T12:08:00.000Z');`,
      );
      before.close();

      const after = openLocalDatabase(path, LOCAL_MIGRATIONS, migrationClock);

      expect(
        after
          .prepare(
            "SELECT id, state, occurred_at, cancellation_authorized_by FROM sales ORDER BY id",
          )
          .all(),
      ).toEqual([
        {
          id: "done",
          state: "COMPLETED",
          occurred_at: "2026-09-30T12:05:00.000Z",
          cancellation_authorized_by: null,
        },
        { id: "open", state: "OPEN", occurred_at: null, cancellation_authorized_by: null },
      ]);
      expect(after.prepare("SELECT id, sale_id FROM sale_lines ORDER BY id").all()).toEqual([
        { id: "l-done", sale_id: "done" },
        { id: "l-open", sale_id: "open" },
      ]);
      expect(after.prepare("SELECT id FROM payment_transactions ORDER BY id").all()).toEqual([
        { id: "pay-done" },
        { id: "pay-open" },
      ]);
      expect(after.pragma("foreign_key_check")).toEqual([]);
      expect(() =>
        after
          .prepare(
            `INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at)
             VALUES ('second', 'r1', 'device-a', 's1', 'u1', 'OPEN', NULL)`,
          )
          .run(),
      ).toThrow(/UNIQUE/);
      after.close();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("add the real-time authorization over the sales and point of sale a register already holds", () => {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const path = join(folder, "register.sqlite");
      const previous = LOCAL_MIGRATIONS.slice(0, 21);
      expect(previous.at(-1)?.name).toBe("0020_cancelled_sales_and_refunds");
      expect(LOCAL_MIGRATIONS.slice(previous.length).map((migration) => migration.name)).toEqual([
        "0021_real_time_authorization",
        "0022_threshold_revisions",
        "0023_sales_stopped_reason",
        "0024_stock_ledger",
        "0025_last_accepted_push",
        "0026_receipt_printing",
      ]);
      const before = openLocalDatabase(path, previous, migrationClock);
      before.exec(
        `INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
         VALUES ('s1', 'r1', 'device-a', 'u1', '2026-09-30T12:00:00.000Z', 0, 'OPEN');
         INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at)
         VALUES ('done', 'r1', 'device-a', 's1', 'u1', 'COMPLETED', '2026-09-30T12:05:00.000Z');
         INSERT INTO register_point_of_sale (register_id, point_of_sale_number, fiscal_address_id, version)
         VALUES ('r1', 12, 'address-1', 2);`,
      );
      before.close();

      const after = openLocalDatabase(path, LOCAL_MIGRATIONS, migrationClock);

      expect(after.prepare("SELECT id, state FROM sales").all()).toEqual([
        { id: "done", state: "COMPLETED" },
      ]);
      expect(
        after
          .prepare(
            `SELECT register_id, point_of_sale_number, version, tax_authority_last_authorized_number
             FROM register_point_of_sale`,
          )
          .all(),
      ).toEqual([
        {
          register_id: "r1",
          point_of_sale_number: 12,
          version: 2,
          tax_authority_last_authorized_number: null,
        },
      ]);
      for (const table of ["register_health_checks", "fiscal_documents", "deferred_sales"]) {
        expect(after.prepare(`SELECT count(*) AS total FROM ${table}`).get()).toEqual({ total: 0 });
      }
      after.close();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("give every buyer-identification threshold a register already holds the first revision of its day", () => {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const path = join(folder, "register.sqlite");
      const previous = LOCAL_MIGRATIONS.slice(0, 22);
      expect(previous.at(-1)?.name).toBe("0021_real_time_authorization");
      expect(LOCAL_MIGRATIONS.slice(previous.length).map((migration) => migration.name)).toEqual([
        "0022_threshold_revisions",
        "0023_sales_stopped_reason",
        "0024_stock_ledger",
        "0025_last_accepted_push",
        "0026_receipt_printing",
      ]);
      const before = openLocalDatabase(path, previous, migrationClock);
      before
        .prepare(
          `INSERT INTO buyer_identification_thresholds (id, amount, valid_from)
           VALUES ('t1', 500000, '2026-01-01'), ('t2', 700000, '2026-06-01')`,
        )
        .run();
      before.close();

      const after = openLocalDatabase(path, LOCAL_MIGRATIONS, migrationClock);

      expect(
        after
          .prepare(
            "SELECT id, amount, valid_from, revision FROM buyer_identification_thresholds ORDER BY id",
          )
          .all(),
      ).toEqual([
        { id: "t1", amount: 500000, valid_from: "2026-01-01", revision: 0 },
        { id: "t2", amount: 700000, valid_from: "2026-06-01", revision: 0 },
      ]);
      after
        .prepare(
          `INSERT INTO buyer_identification_thresholds (id, amount, valid_from, revision)
           VALUES ('t3', 900000, '2026-06-01', 1)`,
        )
        .run();
      after.close();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("add the reason a register stopped opening new sales over the register that already stopped", () => {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const path = join(folder, "register.sqlite");
      const previous = LOCAL_MIGRATIONS.slice(0, 23);
      expect(previous.at(-1)?.name).toBe("0022_threshold_revisions");
      expect(LOCAL_MIGRATIONS.slice(previous.length).map((migration) => migration.name)).toEqual([
        "0023_sales_stopped_reason",
        "0024_stock_ledger",
        "0025_last_accepted_push",
        "0026_receipt_printing",
      ]);
      const before = openLocalDatabase(path, previous, migrationClock);
      before
        .prepare(
          `UPDATE sync_state SET pull_cursor = 7, device_id = 'device-a',
                                 installation_revoked_at = '2026-09-30T08:00:00.000Z'`,
        )
        .run();
      before.close();

      const after = openLocalDatabase(path, LOCAL_MIGRATIONS, migrationClock);

      expect(
        after
          .prepare(
            "SELECT pull_cursor, device_id, installation_revoked_at, sales_stopped_reason FROM sync_state",
          )
          .all(),
      ).toEqual([
        {
          pull_cursor: 7,
          device_id: "device-a",
          installation_revoked_at: "2026-09-30T08:00:00.000Z",
          sales_stopped_reason: null,
        },
      ]);
      after.prepare("UPDATE sync_state SET sales_stopped_reason = 'installation_revoked'").run();
      expect(after.prepare("SELECT sales_stopped_reason FROM sync_state").all()).toEqual([
        { sales_stopped_reason: "installation_revoked" },
      ]);
      after.close();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("add the stock ledger beside the completed sales a register already holds", () => {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const path = join(folder, "register.sqlite");
      const previous = LOCAL_MIGRATIONS.slice(0, 24);
      expect(previous.at(-1)?.name).toBe("0023_sales_stopped_reason");
      expect(LOCAL_MIGRATIONS[previous.length]?.name).toBe("0024_stock_ledger");
      const before = openLocalDatabase(path, previous, migrationClock);
      before.exec(
        `INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
         VALUES ('s1', 'r1', 'device-a', 'u1', '2026-09-30T12:00:00.000Z', 0, 'OPEN');
         INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at)
         VALUES ('sale-1', 'r1', 'device-a', 's1', 'u1', 'COMPLETED', '2026-09-30T12:05:00.000Z');
         INSERT INTO sale_lines (id, sale_id, position, product_id, product_name, quantity, list_unit_price, price_list_id, line_total)
         VALUES ('line-1', 'sale-1', 1, 'p1', 'Yerba', 1, 1500, 'list-1', 1500);`,
      );
      before.close();

      const after = openLocalDatabase(path, LOCAL_MIGRATIONS, migrationClock);

      expect(after.prepare("SELECT id, state FROM sales").all()).toEqual([
        { id: "sale-1", state: "COMPLETED" },
      ]);
      expect(after.prepare("SELECT count(*) AS total FROM stock_movements").get()).toEqual({
        total: 0,
      });
      expect(after.prepare("SELECT count(*) AS total FROM stock_balances").get()).toEqual({
        total: 0,
      });
      const insert = after.prepare(
        `INSERT INTO stock_movements (id, product_id, kind, sale_line_id, delta, occurred_at)
         VALUES (@id, 'p1', @kind, @sale_line_id, -1000, '2026-09-30T12:05:00.000Z')`,
      );
      insert.run({ id: "movement-1", kind: "sale", sale_line_id: "line-1" });
      expect(() => insert.run({ id: "movement-2", kind: "sale", sale_line_id: null })).toThrow(
        /CHECK/,
      );
      expect(() => insert.run({ id: "movement-3", kind: "loss", sale_line_id: "line-1" })).toThrow(
        /CHECK/,
      );
      expect(() => insert.run({ id: "movement-4", kind: "sale", sale_line_id: "missing" })).toThrow(
        /FOREIGN KEY/,
      );
      after.close();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("add the receipt printing beside the completed sales a register already holds", () => {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const path = join(folder, "register.sqlite");
      const previous = LOCAL_MIGRATIONS.filter(({ name }) => name < "0026_receipt_printing");
      expect(previous.at(-1)?.name).toBe("0025_last_accepted_push");
      const before = openLocalDatabase(path, previous, migrationClock);
      before.exec(
        `INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
         VALUES ('s1', 'r1', 'device-a', 'u1', '2026-09-30T12:00:00.000Z', 0, 'OPEN');
         INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at)
         VALUES ('sale-1', 'r1', 'device-a', 's1', 'u1', 'COMPLETED', '2026-09-30T12:05:00.000Z');`,
      );
      before.close();

      const after = openLocalDatabase(path, LOCAL_MIGRATIONS, migrationClock);

      expect(
        after
          .prepare("SELECT id, print_attempted_at, printed_at, operation_number FROM sales")
          .all(),
      ).toEqual([
        { id: "sale-1", print_attempted_at: null, printed_at: null, operation_number: null },
      ]);
      expect(after.prepare("SELECT id, last_number FROM operation_counter").all()).toEqual([
        { id: 1, last_number: 0 },
      ]);
      expect(() =>
        after.prepare("INSERT INTO operation_counter (id, last_number) VALUES (2, 0)").run(),
      ).toThrow(/CHECK/);
      expect(() => after.prepare("UPDATE operation_counter SET last_number = -1").run()).toThrow(
        /CHECK/,
      );
      after.exec(
        `INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at, operation_number)
         VALUES ('sale-2', 'r1', 'device-a', 's1', 'u1', 'COMPLETED', '2026-09-30T12:06:00.000Z', 7),
                ('sale-3', 'r1', 'device-a', 's1', 'u1', 'OPEN', NULL, NULL),
                ('sale-4', 'r1', 'device-a', 's1', 'u1', 'OPEN', NULL, NULL)`,
      );
      expect(() =>
        after.exec(
          `INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at, operation_number)
           VALUES ('sale-5', 'r1', 'device-a', 's1', 'u1', 'COMPLETED', '2026-09-30T12:07:00.000Z', 7)`,
        ),
      ).toThrow(/UNIQUE/);
      const receipt = after.prepare(
        `INSERT INTO sale_receipts (sale_id, template_version, head, body)
         VALUES (@sale_id, @template_version, @head, @body)`,
      );
      const stored = {
        sale_id: "sale-1",
        template_version: "1",
        head: Buffer.from([1]),
        body: Buffer.from([2]),
      };
      receipt.run(stored);
      expect(() => receipt.run(stored)).toThrow(/UNIQUE|PRIMARY KEY/);
      expect(() => receipt.run({ ...stored, sale_id: "missing" })).toThrow(/FOREIGN KEY/);
      expect(() => receipt.run({ ...stored, sale_id: "sale-1", head: null })).toThrow(/NOT NULL/);

      const reprint = after.prepare(
        `INSERT INTO sale_reprints (sale_id, order_number, requested_by, authorized_by, reason_kind, reason_text, occurred_at)
         VALUES (@sale_id, @order_number, 'u1', NULL, @reason_kind, @reason_text, '2026-09-30T12:10:00.000Z')`,
      );
      const retry = { sale_id: "sale-1", order_number: 1, reason_kind: "retry", reason_text: null };
      reprint.run(retry);
      expect(() => reprint.run(retry)).toThrow(/UNIQUE|PRIMARY KEY/);
      reprint.run({ ...retry, order_number: 2, reason_kind: "requested", reason_text: "Ink" });
      expect(() => reprint.run({ ...retry, order_number: 3, sale_id: "missing" })).toThrow(
        /FOREIGN KEY/,
      );
      expect(() => reprint.run({ ...retry, order_number: 0 })).toThrow(/CHECK/);
      expect(() => reprint.run({ ...retry, order_number: 4, reason_kind: "other" })).toThrow(
        /CHECK/,
      );
      expect(() => reprint.run({ ...retry, order_number: 5, reason_text: "Ink" })).toThrow(/CHECK/);
      expect(() =>
        reprint.run({ ...retry, order_number: 6, reason_kind: "requested", reason_text: null }),
      ).toThrow(/CHECK/);
      after.close();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("add the last accepted push over the register that already synced, empty until a push is accepted", () => {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const path = join(folder, "register.sqlite");
      const previous = LOCAL_MIGRATIONS.slice(0, 25);
      expect(previous.at(-1)?.name).toBe("0024_stock_ledger");
      expect(LOCAL_MIGRATIONS[previous.length]?.name).toBe("0025_last_accepted_push");
      const before = openLocalDatabase(path, previous, migrationClock);
      before
        .prepare(
          `UPDATE sync_state SET pull_cursor = 7, device_id = 'device-a',
                                 sales_stopped_reason = 'installation_revoked'`,
        )
        .run();
      before.close();

      const after = openLocalDatabase(path, LOCAL_MIGRATIONS, migrationClock);

      expect(
        after
          .prepare(
            "SELECT pull_cursor, device_id, sales_stopped_reason, last_accepted_push_at FROM sync_state",
          )
          .all(),
      ).toEqual([
        {
          pull_cursor: 7,
          device_id: "device-a",
          sales_stopped_reason: "installation_revoked",
          last_accepted_push_at: null,
        },
      ]);
      after
        .prepare("UPDATE sync_state SET last_accepted_push_at = '2026-10-05T15:00:00.000Z'")
        .run();
      expect(after.prepare("SELECT last_accepted_push_at FROM sync_state").all()).toEqual([
        { last_accepted_push_at: "2026-10-05T15:00:00.000Z" },
      ]);
      after.close();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  describe("the real-time authorization", () => {
    function withSales() {
      const database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
      database.exec(
        `INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
         VALUES ('s1', 'r1', 'device-a', 'u1', '2026-09-30T12:00:00.000Z', 0, 'OPEN');
         INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at)
         VALUES ('sale-1', 'r1', 'device-a', 's1', 'u1', 'COMPLETED', '2026-09-30T12:05:00.000Z'),
                ('sale-2', 'r1', 'device-a', 's1', 'u1', 'COMPLETED', '2026-09-30T12:06:00.000Z');`,
      );
      return database;
    }

    type Database = ReturnType<typeof openLocalDatabase>;

    function insertDocument(
      database: Database,
      values: Partial<{
        id: string;
        sale_id: string;
        point_of_sale: number;
        document_type: string;
        number: number;
        state: string;
        authorization_code: string | null;
        authorization_code_due_on: string | null;
        resolved_at: string | null;
      }> = {},
    ) {
      const state = values.state ?? "REQUESTING";
      database
        .prepare(
          `INSERT INTO fiscal_documents (
             id, sale_id, point_of_sale, document_type, number, issued_on, document, state,
             authorization_code, authorization_code_due_on, reserved_at, resolved_at
           ) VALUES (
             @id, @sale_id, @point_of_sale, @document_type, @number, '2026-09-30', '{}', @state,
             @authorization_code, @authorization_code_due_on, '2026-09-30T12:05:00.000Z', @resolved_at
           )`,
        )
        .run({
          id: "doc-1",
          sale_id: "sale-1",
          point_of_sale: 12,
          document_type: "FACTURA_C",
          number: 41,
          state,
          authorization_code: state === "AUTHORIZED" ? "75123456789012" : null,
          authorization_code_due_on: state === "AUTHORIZED" ? "2026-10-10" : null,
          resolved_at: state === "REQUESTING" ? null : "2026-09-30T12:05:01.000Z",
          ...values,
        });
    }

    it("hold a successful health check with its round trip and what it found out", () => {
      const database = withSales();
      const insert = database.prepare(
        `INSERT INTO register_health_checks (checked_at, round_trip_ms, token_valid, arca_reachable)
         VALUES (@checked_at, @round_trip_ms, @token_valid, @arca_reachable)`,
      );
      const check = {
        checked_at: "2026-09-30T12:05:00.000Z",
        round_trip_ms: 120,
        token_valid: 1,
        arca_reachable: 0,
      };

      insert.run(check);
      insert.run({ ...check, checked_at: "2026-09-30T12:05:05.000Z" });

      expect(
        database
          .prepare(
            "SELECT checked_at, round_trip_ms, token_valid, arca_reachable FROM register_health_checks ORDER BY id",
          )
          .all(),
      ).toEqual([{ ...check }, { ...check, checked_at: "2026-09-30T12:05:05.000Z" }]);
      expect(() => insert.run({ ...check, round_trip_ms: -1 })).toThrow(/CHECK/);
      expect(() => insert.run({ ...check, token_valid: 2 })).toThrow(/CHECK/);
      expect(() => insert.run({ ...check, arca_reachable: 2 })).toThrow(/CHECK/);
      database.close();
    });

    it("give a sale at most one fiscal document, of a known sale", () => {
      const database = withSales();

      insertDocument(database, { state: "REJECTED" });

      expect(() => insertDocument(database, { id: "doc-2", number: 42 })).toThrow(/UNIQUE/);
      expect(() => insertDocument(database, { id: "doc-3", sale_id: "missing" })).toThrow(
        /FOREIGN KEY/,
      );
      database.close();
    });

    it("hold a document of a known type and state with a point of sale and a positive number", () => {
      const database = withSales();

      expect(() => insertDocument(database, { document_type: "FACTURA_A" })).toThrow(/CHECK/);
      expect(() => insertDocument(database, { state: "PENDING" })).toThrow(/CHECK/);
      expect(() => insertDocument(database, { point_of_sale: 0 })).toThrow(/CHECK/);
      expect(() => insertDocument(database, { number: 0 })).toThrow(/CHECK/);
      database.close();
    });

    it("carry the authorization code and its expiry only once authorized, and a resolution date once resolved", () => {
      const database = withSales();

      expect(() =>
        insertDocument(database, { state: "AUTHORIZED", authorization_code: null }),
      ).toThrow(/CHECK/);
      expect(() =>
        insertDocument(database, { state: "AUTHORIZED", authorization_code_due_on: null }),
      ).toThrow(/CHECK/);
      expect(() =>
        insertDocument(database, { state: "UNKNOWN", authorization_code: "75123456789012" }),
      ).toThrow(/CHECK/);
      expect(() =>
        insertDocument(database, { state: "REQUESTING", resolved_at: "2026-09-30T12:05:01.000Z" }),
      ).toThrow(/CHECK/);
      expect(() => insertDocument(database, { state: "REJECTED", resolved_at: null })).toThrow(
        /CHECK/,
      );
      insertDocument(database, { state: "AUTHORIZED" });
      database.close();
    });

    it.each(["REQUESTING", "UNKNOWN"])(
      "allow no second document of the point of sale and type while one is %s",
      (waiting) => {
        const database = withSales();
        insertDocument(database, { state: waiting });

        expect(() =>
          insertDocument(database, { id: "doc-2", sale_id: "sale-2", number: 42 }),
        ).toThrow(/UNIQUE/);
        insertDocument(database, { id: "doc-2", sale_id: "sale-2", point_of_sale: 13, number: 42 });
        database.close();
      },
    );

    it.each(["AUTHORIZED", "REJECTED"])(
      "allow the next document of the point of sale once the previous is %s",
      (resolved) => {
        const database = withSales();
        insertDocument(database, { state: resolved });

        insertDocument(database, { id: "doc-2", sale_id: "sale-2", number: 42 });

        expect(database.prepare("SELECT count(*) AS total FROM fiscal_documents").get()).toEqual({
          total: 2,
        });
        database.close();
      },
    );

    it("keep the number of an authorized document unavailable to another document of its point of sale and type", () => {
      const database = withSales();
      insertDocument(database, { state: "AUTHORIZED" });

      expect(() =>
        insertDocument(database, { id: "doc-2", sale_id: "sale-2", state: "REJECTED" }),
      ).not.toThrow();
      expect(() => insertDocument(database, { id: "doc-3", sale_id: "sale-2" })).toThrow(/UNIQUE/);
      database.close();
    });

    it("release the number of a rejected document", () => {
      const database = withSales();
      insertDocument(database, { state: "REJECTED" });

      insertDocument(database, { id: "doc-2", sale_id: "sale-2" });

      expect(
        database.prepare("SELECT id, number, state FROM fiscal_documents ORDER BY id").all(),
      ).toEqual([
        { id: "doc-1", number: 41, state: "REJECTED" },
        { id: "doc-2", number: 41, state: "REQUESTING" },
      ]);
      database.close();
    });

    function routeSale(database: Database, values: { sale_id: string; reason: string }) {
      database
        .prepare(
          "INSERT INTO deferred_sales (sale_id, reason, routed_at) VALUES (@sale_id, @reason, '2026-09-30T12:05:00.000Z')",
        )
        .run(values);
    }

    it.each(DEFERRAL_REASONS)("route a sale to the deferred flow for the reason %s", (reason) => {
      const database = withSales();

      routeSale(database, { sale_id: "sale-1", reason });

      expect(database.prepare("SELECT sale_id, reason FROM deferred_sales").all()).toEqual([
        { sale_id: "sale-1", reason },
      ]);
      database.close();
    });

    it("route a known sale once, for a reason the domain knows", () => {
      const database = withSales();
      routeSale(database, { sale_id: "sale-1", reason: "rejected" });

      expect(() => routeSale(database, { sale_id: "sale-1", reason: "rejected" })).toThrow(
        /UNIQUE/,
      );
      expect(() => routeSale(database, { sale_id: "sale-2", reason: "forgotten" })).toThrow(
        /CHECK/,
      );
      expect(() => routeSale(database, { sale_id: "missing", reason: "rejected" })).toThrow(
        /FOREIGN KEY/,
      );
      database.close();
    });

    it("hold a tax authority count of zero or more on the point of sale, none until it is pulled", () => {
      const database = withSales();
      const insert = database.prepare(
        `INSERT INTO register_point_of_sale (register_id, point_of_sale_number, fiscal_address_id, version, tax_authority_last_authorized_number)
         VALUES ('r1', 12, 'address-1', 1, @count)`,
      );

      expect(() => insert.run({ count: -1 })).toThrow(/CHECK/);
      insert.run({ count: 0 });
      database.close();
    });
  });

  describe("the cancelled sales and the payment refunds", () => {
    function withPaidSale() {
      const database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
      database.exec(
        `INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
         VALUES ('s1', 'r1', 'device-a', 'u1', '2026-09-30T12:00:00.000Z', 0, 'OPEN');
         INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at)
         VALUES ('sale-1', 'r1', 'device-a', 's1', 'u1', 'OPEN', NULL);
         INSERT INTO payment_transactions (id, sale_id, kind, method, provider, amount, tendered, state, occurred_at)
         VALUES ('pay-1', 'sale-1', 'SALE', 'CASH', 'NONE', 400, 400, 'APPROVED', '2026-09-30T12:08:00.000Z');`,
      );
      return database;
    }

    function cancel(database: ReturnType<typeof openLocalDatabase>, occurredAt: string | null) {
      database
        .prepare("UPDATE sales SET state = 'CANCELLED', occurred_at = ? WHERE id = 'sale-1'")
        .run(occurredAt);
    }

    function insertRefund(
      database: ReturnType<typeof openLocalDatabase>,
      values: Partial<{
        id: string;
        payment_id: string;
        method: string;
        provider: string;
        amount: number;
        state: string;
      }>,
    ) {
      database
        .prepare(
          `INSERT INTO payment_refunds (id, payment_id, method, provider, amount, state, occurred_at)
           VALUES (@id, @payment_id, @method, @provider, @amount, @state, '2026-09-30T12:10:00.000Z')`,
        )
        .run({
          id: "refund-1",
          payment_id: "pay-1",
          method: "CASH",
          provider: "NONE",
          amount: 400,
          state: "APPROVED",
          ...values,
        });
    }

    it("date a cancelled sale with its cancellation and name who authorized it only then", () => {
      const database = withPaidSale();

      expect(() => cancel(database, null)).toThrow(/CHECK/);
      cancel(database, "2026-09-30T12:10:00.000Z");
      database.prepare("UPDATE sales SET cancellation_authorized_by = 'u2'").run();
      expect(() =>
        database
          .prepare("UPDATE sales SET state = 'COMPLETED', cancellation_authorized_by = 'u2'")
          .run(),
      ).toThrow(/CHECK/);
      database.close();
    });

    it("keep a pending refund of a payment next to a refund already given, several per payment", () => {
      const database = withPaidSale();

      insertRefund(database, {});
      insertRefund(database, { id: "refund-2", method: "TRANSFER", state: "PENDING", amount: 100 });

      expect(database.prepare("SELECT id, state FROM payment_refunds ORDER BY id").all()).toEqual([
        { id: "refund-1", state: "APPROVED" },
        { id: "refund-2", state: "PENDING" },
      ]);
      database.close();
    });

    it("refuse a refund of an unknown payment, of no amount or in an unknown state", () => {
      const database = withPaidSale();

      expect(() => insertRefund(database, { payment_id: "missing" })).toThrow(/FOREIGN KEY/);
      expect(() => insertRefund(database, { amount: 0 })).toThrow(/CHECK/);
      expect(() => insertRefund(database, { state: "DECLINED" })).toThrow(/CHECK/);
      expect(() => insertRefund(database, { method: "CARD" })).toThrow(/CHECK/);
      database.close();
    });
  });
});
