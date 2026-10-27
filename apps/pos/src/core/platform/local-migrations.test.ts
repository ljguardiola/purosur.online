import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { CONTINGENCY_BACKUP_OPERATIONS, DEFERRAL_REASONS } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import {
  insertOfflineCreditNote,
  insertOfflineFiscalDocument,
} from "../fiscal/test-support/real-time-authorization-database";
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
          `INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at, voided_at)
           VALUES (?, 'r1', 'device-a', ?, 'u1', ?, ?, ?)`,
        )
        .run(
          id,
          sessionId,
          state,
          state === "OPEN" ? null : "2026-09-30T12:00:00.000Z",
          state === "VOIDED" ? "2026-09-30T12:10:00.000Z" : null,
        );
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

    it("hold one line per position with a positive quantity, a product as many times as it was sold", () => {
      const database = withSession();
      insertSale(database, "a", "OPEN");
      const insertLine = database.prepare(
        `INSERT INTO sale_lines (id, sale_id, position, product_id, product_name, quantity, list_unit_price, price_list_id, line_total)
         VALUES (@id, 'a', @position, @product_id, 'Yerba', @quantity, 1000, 'pl', 1000)`,
      );
      insertLine.run({ id: "l1", position: 1, product_id: "p1", quantity: 1 });

      expect(() =>
        insertLine.run({ id: "l2", position: 1, product_id: "p2", quantity: 1 }),
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
          name: string;
          kind: string;
          percent: number | null;
          buy_qty: number | null;
          pay_qty: number | null;
        }>,
      ) {
        database
          .prepare(
            `INSERT INTO sale_line_promotions (line_id, discount_id, name, kind, percent, buy_qty, pay_qty)
             VALUES (@line_id, @discount_id, @name, @kind, @percent, @buy_qty, @pay_qty)`,
          )
          .run({
            line_id: "l1",
            discount_id: "d1",
            name: "Diez por ciento",
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
        "0026_pulled_stock_movements",
        "0027_receipt_printing",
        "0028_mercado_pago_qr_payments",
        "0029_register_offline_point_of_sale",
        "0030_stock_receipts",
        "0031_receipt_printer",
        "0032_offline_numbering",
        "0033_weighed_sale_lines",
        "0034_serial_devices",
        "0035_domain_fiscal_document_type",
        "0036_replaced_qr_payments",
        "0037_offline_point_of_sale_tax_authority_count",
        "0038_pulled_table_redeliveries",
        "0039_manual_line_adjustments",
        "0040_unclear_outcome_settlements",
        "0041_sale_total_discounts",
        "0042_initial_count",
        "0043_integrated_terminal_payments",
        "0044_deferred_sale_records",
        "0045_refund_completions",
        "0046_standalone_terminal_payments",
        "0047_sale_line_promotion_names",
        "0048_standalone_terminal_refunds",
        "0049_qr_refunds",
        "0050_offline_fiscal_documents",
        "0051_register_point_terminal",
        "0052_paid_orders_without_sale",
        "0053_price_and_discount_lookups",
        "0054_assembly_movements",
        "0055_offline_numbering_floor",
        "0056_numbering_freeze",
        "0057_voided_sales",
        "0058_register_clock_guard",
        "0059_point_refunds",
        "0062_health_check_clock_offset",
        "0063_register_predecessor",
        "0064_void_credit_notes",
        "0066_register_qr_point_of_sale",
        "0067_replenished_events",
        "0068_clock_correction_lapse_cause",
        "0070_stale_sequence",
        "0071_credit_note_reprints",
        "0072_awaiting_restored_numbering",
        "0073_replenished_credit_note_requests",
        "0074_awaiting_orphan_sweep",
        "0075_deferred_sale_backlog",
        "0076_awaiting_orphan_sweep_origin",
        "0077_contingency_backup_tickets",
        "0078_offline_void_credit_notes",
        "0079_replenishment_failure",
        "0080_deferred_sale_invoice_prints",
        "0081_awaiting_contingency_ticket_recovery",
        "0082_sale_returns",
        "0083_point_card_type",
        "0084_zone_rules",
        "0085_return_credit_notes",
        "0086_returns_of_branch_sales",
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
        "0026_pulled_stock_movements",
        "0027_receipt_printing",
        "0028_mercado_pago_qr_payments",
        "0029_register_offline_point_of_sale",
        "0030_stock_receipts",
        "0031_receipt_printer",
        "0032_offline_numbering",
        "0033_weighed_sale_lines",
        "0034_serial_devices",
        "0035_domain_fiscal_document_type",
        "0036_replaced_qr_payments",
        "0037_offline_point_of_sale_tax_authority_count",
        "0038_pulled_table_redeliveries",
        "0039_manual_line_adjustments",
        "0040_unclear_outcome_settlements",
        "0041_sale_total_discounts",
        "0042_initial_count",
        "0043_integrated_terminal_payments",
        "0044_deferred_sale_records",
        "0045_refund_completions",
        "0046_standalone_terminal_payments",
        "0047_sale_line_promotion_names",
        "0048_standalone_terminal_refunds",
        "0049_qr_refunds",
        "0050_offline_fiscal_documents",
        "0051_register_point_terminal",
        "0052_paid_orders_without_sale",
        "0053_price_and_discount_lookups",
        "0054_assembly_movements",
        "0055_offline_numbering_floor",
        "0056_numbering_freeze",
        "0057_voided_sales",
        "0058_register_clock_guard",
        "0059_point_refunds",
        "0062_health_check_clock_offset",
        "0063_register_predecessor",
        "0064_void_credit_notes",
        "0066_register_qr_point_of_sale",
        "0067_replenished_events",
        "0068_clock_correction_lapse_cause",
        "0070_stale_sequence",
        "0071_credit_note_reprints",
        "0072_awaiting_restored_numbering",
        "0073_replenished_credit_note_requests",
        "0074_awaiting_orphan_sweep",
        "0075_deferred_sale_backlog",
        "0076_awaiting_orphan_sweep_origin",
        "0077_contingency_backup_tickets",
        "0078_offline_void_credit_notes",
        "0079_replenishment_failure",
        "0080_deferred_sale_invoice_prints",
        "0081_awaiting_contingency_ticket_recovery",
        "0082_sale_returns",
        "0083_point_card_type",
        "0084_zone_rules",
        "0085_return_credit_notes",
        "0086_returns_of_branch_sales",
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
        "0026_pulled_stock_movements",
        "0027_receipt_printing",
        "0028_mercado_pago_qr_payments",
        "0029_register_offline_point_of_sale",
        "0030_stock_receipts",
        "0031_receipt_printer",
        "0032_offline_numbering",
        "0033_weighed_sale_lines",
        "0034_serial_devices",
        "0035_domain_fiscal_document_type",
        "0036_replaced_qr_payments",
        "0037_offline_point_of_sale_tax_authority_count",
        "0038_pulled_table_redeliveries",
        "0039_manual_line_adjustments",
        "0040_unclear_outcome_settlements",
        "0041_sale_total_discounts",
        "0042_initial_count",
        "0043_integrated_terminal_payments",
        "0044_deferred_sale_records",
        "0045_refund_completions",
        "0046_standalone_terminal_payments",
        "0047_sale_line_promotion_names",
        "0048_standalone_terminal_refunds",
        "0049_qr_refunds",
        "0050_offline_fiscal_documents",
        "0051_register_point_terminal",
        "0052_paid_orders_without_sale",
        "0053_price_and_discount_lookups",
        "0054_assembly_movements",
        "0055_offline_numbering_floor",
        "0056_numbering_freeze",
        "0057_voided_sales",
        "0058_register_clock_guard",
        "0059_point_refunds",
        "0062_health_check_clock_offset",
        "0063_register_predecessor",
        "0064_void_credit_notes",
        "0066_register_qr_point_of_sale",
        "0067_replenished_events",
        "0068_clock_correction_lapse_cause",
        "0070_stale_sequence",
        "0071_credit_note_reprints",
        "0072_awaiting_restored_numbering",
        "0073_replenished_credit_note_requests",
        "0074_awaiting_orphan_sweep",
        "0075_deferred_sale_backlog",
        "0076_awaiting_orphan_sweep_origin",
        "0077_contingency_backup_tickets",
        "0078_offline_void_credit_notes",
        "0079_replenishment_failure",
        "0080_deferred_sale_invoice_prints",
        "0081_awaiting_contingency_ticket_recovery",
        "0082_sale_returns",
        "0083_point_card_type",
        "0084_zone_rules",
        "0085_return_credit_notes",
        "0086_returns_of_branch_sales",
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
        "0026_pulled_stock_movements",
        "0027_receipt_printing",
        "0028_mercado_pago_qr_payments",
        "0029_register_offline_point_of_sale",
        "0030_stock_receipts",
        "0031_receipt_printer",
        "0032_offline_numbering",
        "0033_weighed_sale_lines",
        "0034_serial_devices",
        "0035_domain_fiscal_document_type",
        "0036_replaced_qr_payments",
        "0037_offline_point_of_sale_tax_authority_count",
        "0038_pulled_table_redeliveries",
        "0039_manual_line_adjustments",
        "0040_unclear_outcome_settlements",
        "0041_sale_total_discounts",
        "0042_initial_count",
        "0043_integrated_terminal_payments",
        "0044_deferred_sale_records",
        "0045_refund_completions",
        "0046_standalone_terminal_payments",
        "0047_sale_line_promotion_names",
        "0048_standalone_terminal_refunds",
        "0049_qr_refunds",
        "0050_offline_fiscal_documents",
        "0051_register_point_terminal",
        "0052_paid_orders_without_sale",
        "0053_price_and_discount_lookups",
        "0054_assembly_movements",
        "0055_offline_numbering_floor",
        "0056_numbering_freeze",
        "0057_voided_sales",
        "0058_register_clock_guard",
        "0059_point_refunds",
        "0062_health_check_clock_offset",
        "0063_register_predecessor",
        "0064_void_credit_notes",
        "0066_register_qr_point_of_sale",
        "0067_replenished_events",
        "0068_clock_correction_lapse_cause",
        "0070_stale_sequence",
        "0071_credit_note_reprints",
        "0072_awaiting_restored_numbering",
        "0073_replenished_credit_note_requests",
        "0074_awaiting_orphan_sweep",
        "0075_deferred_sale_backlog",
        "0076_awaiting_orphan_sweep_origin",
        "0077_contingency_backup_tickets",
        "0078_offline_void_credit_notes",
        "0079_replenishment_failure",
        "0080_deferred_sale_invoice_prints",
        "0081_awaiting_contingency_ticket_recovery",
        "0082_sale_returns",
        "0083_point_card_type",
        "0084_zone_rules",
        "0085_return_credit_notes",
        "0086_returns_of_branch_sales",
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
         INSERT INTO discounts (id, name, kind, percent, buy_qty, pay_qty, target_kind, target_id, valid_from, valid_to, weekdays, active, version)
         VALUES ('ten', 'Diez por ciento', 'PERCENT_OFF', 10, NULL, NULL, 'PRODUCT', 'p1', '2026-09-01', '2026-12-31', '[]', 1, 1);
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
        "0026_pulled_stock_movements",
        "0027_receipt_printing",
        "0028_mercado_pago_qr_payments",
        "0029_register_offline_point_of_sale",
        "0030_stock_receipts",
        "0031_receipt_printer",
        "0032_offline_numbering",
        "0033_weighed_sale_lines",
        "0034_serial_devices",
        "0035_domain_fiscal_document_type",
        "0036_replaced_qr_payments",
        "0037_offline_point_of_sale_tax_authority_count",
        "0038_pulled_table_redeliveries",
        "0039_manual_line_adjustments",
        "0040_unclear_outcome_settlements",
        "0041_sale_total_discounts",
        "0042_initial_count",
        "0043_integrated_terminal_payments",
        "0044_deferred_sale_records",
        "0045_refund_completions",
        "0046_standalone_terminal_payments",
        "0047_sale_line_promotion_names",
        "0048_standalone_terminal_refunds",
        "0049_qr_refunds",
        "0050_offline_fiscal_documents",
        "0051_register_point_terminal",
        "0052_paid_orders_without_sale",
        "0053_price_and_discount_lookups",
        "0054_assembly_movements",
        "0055_offline_numbering_floor",
        "0056_numbering_freeze",
        "0057_voided_sales",
        "0058_register_clock_guard",
        "0059_point_refunds",
        "0062_health_check_clock_offset",
        "0063_register_predecessor",
        "0064_void_credit_notes",
        "0066_register_qr_point_of_sale",
        "0067_replenished_events",
        "0068_clock_correction_lapse_cause",
        "0070_stale_sequence",
        "0071_credit_note_reprints",
        "0072_awaiting_restored_numbering",
        "0073_replenished_credit_note_requests",
        "0074_awaiting_orphan_sweep",
        "0075_deferred_sale_backlog",
        "0076_awaiting_orphan_sweep_origin",
        "0077_contingency_backup_tickets",
        "0078_offline_void_credit_notes",
        "0079_replenishment_failure",
        "0080_deferred_sale_invoice_prints",
        "0081_awaiting_contingency_ticket_recovery",
        "0082_sale_returns",
        "0083_point_card_type",
        "0084_zone_rules",
        "0085_return_credit_notes",
        "0086_returns_of_branch_sales",
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
        "0026_pulled_stock_movements",
        "0027_receipt_printing",
        "0028_mercado_pago_qr_payments",
        "0029_register_offline_point_of_sale",
        "0030_stock_receipts",
        "0031_receipt_printer",
        "0032_offline_numbering",
        "0033_weighed_sale_lines",
        "0034_serial_devices",
        "0035_domain_fiscal_document_type",
        "0036_replaced_qr_payments",
        "0037_offline_point_of_sale_tax_authority_count",
        "0038_pulled_table_redeliveries",
        "0039_manual_line_adjustments",
        "0040_unclear_outcome_settlements",
        "0041_sale_total_discounts",
        "0042_initial_count",
        "0043_integrated_terminal_payments",
        "0044_deferred_sale_records",
        "0045_refund_completions",
        "0046_standalone_terminal_payments",
        "0047_sale_line_promotion_names",
        "0048_standalone_terminal_refunds",
        "0049_qr_refunds",
        "0050_offline_fiscal_documents",
        "0051_register_point_terminal",
        "0052_paid_orders_without_sale",
        "0053_price_and_discount_lookups",
        "0054_assembly_movements",
        "0055_offline_numbering_floor",
        "0056_numbering_freeze",
        "0057_voided_sales",
        "0058_register_clock_guard",
        "0059_point_refunds",
        "0062_health_check_clock_offset",
        "0063_register_predecessor",
        "0064_void_credit_notes",
        "0066_register_qr_point_of_sale",
        "0067_replenished_events",
        "0068_clock_correction_lapse_cause",
        "0070_stale_sequence",
        "0071_credit_note_reprints",
        "0072_awaiting_restored_numbering",
        "0073_replenished_credit_note_requests",
        "0074_awaiting_orphan_sweep",
        "0075_deferred_sale_backlog",
        "0076_awaiting_orphan_sweep_origin",
        "0077_contingency_backup_tickets",
        "0078_offline_void_credit_notes",
        "0079_replenishment_failure",
        "0080_deferred_sale_invoice_prints",
        "0081_awaiting_contingency_ticket_recovery",
        "0082_sale_returns",
        "0083_point_card_type",
        "0084_zone_rules",
        "0085_return_credit_notes",
        "0086_returns_of_branch_sales",
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
        "0026_pulled_stock_movements",
        "0027_receipt_printing",
        "0028_mercado_pago_qr_payments",
        "0029_register_offline_point_of_sale",
        "0030_stock_receipts",
        "0031_receipt_printer",
        "0032_offline_numbering",
        "0033_weighed_sale_lines",
        "0034_serial_devices",
        "0035_domain_fiscal_document_type",
        "0036_replaced_qr_payments",
        "0037_offline_point_of_sale_tax_authority_count",
        "0038_pulled_table_redeliveries",
        "0039_manual_line_adjustments",
        "0040_unclear_outcome_settlements",
        "0041_sale_total_discounts",
        "0042_initial_count",
        "0043_integrated_terminal_payments",
        "0044_deferred_sale_records",
        "0045_refund_completions",
        "0046_standalone_terminal_payments",
        "0047_sale_line_promotion_names",
        "0048_standalone_terminal_refunds",
        "0049_qr_refunds",
        "0050_offline_fiscal_documents",
        "0051_register_point_terminal",
        "0052_paid_orders_without_sale",
        "0053_price_and_discount_lookups",
        "0054_assembly_movements",
        "0055_offline_numbering_floor",
        "0056_numbering_freeze",
        "0057_voided_sales",
        "0058_register_clock_guard",
        "0059_point_refunds",
        "0062_health_check_clock_offset",
        "0063_register_predecessor",
        "0064_void_credit_notes",
        "0066_register_qr_point_of_sale",
        "0067_replenished_events",
        "0068_clock_correction_lapse_cause",
        "0070_stale_sequence",
        "0071_credit_note_reprints",
        "0072_awaiting_restored_numbering",
        "0073_replenished_credit_note_requests",
        "0074_awaiting_orphan_sweep",
        "0075_deferred_sale_backlog",
        "0076_awaiting_orphan_sweep_origin",
        "0077_contingency_backup_tickets",
        "0078_offline_void_credit_notes",
        "0079_replenishment_failure",
        "0080_deferred_sale_invoice_prints",
        "0081_awaiting_contingency_ticket_recovery",
        "0082_sale_returns",
        "0083_point_card_type",
        "0084_zone_rules",
        "0085_return_credit_notes",
        "0086_returns_of_branch_sales",
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

  it("add no clock offset to the health checks a register already holds", () => {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const path = join(folder, "register.sqlite");
      const previous = LOCAL_MIGRATIONS.filter(
        (migration) => migration.name < "0062_health_check_clock_offset",
      );
      const before = openLocalDatabase(path, previous, migrationClock);
      before.exec(
        `INSERT INTO register_health_checks (checked_at, round_trip_ms, token_valid, arca_reachable)
         VALUES ('2026-09-30T12:00:05.000Z', 120, 1, 1)`,
      );
      before.close();

      const after = openLocalDatabase(path, LOCAL_MIGRATIONS, migrationClock);

      expect(
        after.prepare("SELECT round_trip_ms, clock_offset_ms FROM register_health_checks").all(),
      ).toEqual([{ round_trip_ms: 120, clock_offset_ms: null }]);
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
        "0026_pulled_stock_movements",
        "0027_receipt_printing",
        "0028_mercado_pago_qr_payments",
        "0029_register_offline_point_of_sale",
        "0030_stock_receipts",
        "0031_receipt_printer",
        "0032_offline_numbering",
        "0033_weighed_sale_lines",
        "0034_serial_devices",
        "0035_domain_fiscal_document_type",
        "0036_replaced_qr_payments",
        "0037_offline_point_of_sale_tax_authority_count",
        "0038_pulled_table_redeliveries",
        "0039_manual_line_adjustments",
        "0040_unclear_outcome_settlements",
        "0041_sale_total_discounts",
        "0042_initial_count",
        "0043_integrated_terminal_payments",
        "0044_deferred_sale_records",
        "0045_refund_completions",
        "0046_standalone_terminal_payments",
        "0047_sale_line_promotion_names",
        "0048_standalone_terminal_refunds",
        "0049_qr_refunds",
        "0050_offline_fiscal_documents",
        "0051_register_point_terminal",
        "0052_paid_orders_without_sale",
        "0053_price_and_discount_lookups",
        "0054_assembly_movements",
        "0055_offline_numbering_floor",
        "0056_numbering_freeze",
        "0057_voided_sales",
        "0058_register_clock_guard",
        "0059_point_refunds",
        "0062_health_check_clock_offset",
        "0063_register_predecessor",
        "0064_void_credit_notes",
        "0066_register_qr_point_of_sale",
        "0067_replenished_events",
        "0068_clock_correction_lapse_cause",
        "0070_stale_sequence",
        "0071_credit_note_reprints",
        "0072_awaiting_restored_numbering",
        "0073_replenished_credit_note_requests",
        "0074_awaiting_orphan_sweep",
        "0075_deferred_sale_backlog",
        "0076_awaiting_orphan_sweep_origin",
        "0077_contingency_backup_tickets",
        "0078_offline_void_credit_notes",
        "0079_replenishment_failure",
        "0080_deferred_sale_invoice_prints",
        "0081_awaiting_contingency_ticket_recovery",
        "0082_sale_returns",
        "0083_point_card_type",
        "0084_zone_rules",
        "0085_return_credit_notes",
        "0086_returns_of_branch_sales",
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
        "0026_pulled_stock_movements",
        "0027_receipt_printing",
        "0028_mercado_pago_qr_payments",
        "0029_register_offline_point_of_sale",
        "0030_stock_receipts",
        "0031_receipt_printer",
        "0032_offline_numbering",
        "0033_weighed_sale_lines",
        "0034_serial_devices",
        "0035_domain_fiscal_document_type",
        "0036_replaced_qr_payments",
        "0037_offline_point_of_sale_tax_authority_count",
        "0038_pulled_table_redeliveries",
        "0039_manual_line_adjustments",
        "0040_unclear_outcome_settlements",
        "0041_sale_total_discounts",
        "0042_initial_count",
        "0043_integrated_terminal_payments",
        "0044_deferred_sale_records",
        "0045_refund_completions",
        "0046_standalone_terminal_payments",
        "0047_sale_line_promotion_names",
        "0048_standalone_terminal_refunds",
        "0049_qr_refunds",
        "0050_offline_fiscal_documents",
        "0051_register_point_terminal",
        "0052_paid_orders_without_sale",
        "0053_price_and_discount_lookups",
        "0054_assembly_movements",
        "0055_offline_numbering_floor",
        "0056_numbering_freeze",
        "0057_voided_sales",
        "0058_register_clock_guard",
        "0059_point_refunds",
        "0062_health_check_clock_offset",
        "0063_register_predecessor",
        "0064_void_credit_notes",
        "0066_register_qr_point_of_sale",
        "0067_replenished_events",
        "0068_clock_correction_lapse_cause",
        "0070_stale_sequence",
        "0071_credit_note_reprints",
        "0072_awaiting_restored_numbering",
        "0073_replenished_credit_note_requests",
        "0074_awaiting_orphan_sweep",
        "0075_deferred_sale_backlog",
        "0076_awaiting_orphan_sweep_origin",
        "0077_contingency_backup_tickets",
        "0078_offline_void_credit_notes",
        "0079_replenishment_failure",
        "0080_deferred_sale_invoice_prints",
        "0081_awaiting_contingency_ticket_recovery",
        "0082_sale_returns",
        "0083_point_card_type",
        "0084_zone_rules",
        "0085_return_credit_notes",
        "0086_returns_of_branch_sales",
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

      const after = openLocalDatabase(path, LOCAL_MIGRATIONS.slice(0, 25), migrationClock);

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

  it("add the receipt printing beside the completed sales a register already holds, freezing each sold line's unit from its product", () => {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const path = join(folder, "register.sqlite");
      const previous = LOCAL_MIGRATIONS.filter(({ name }) => name < "0027_receipt_printing");
      expect(previous.at(-1)?.name).toBe("0026_pulled_stock_movements");
      const before = openLocalDatabase(path, previous, migrationClock);
      before.exec(
        `INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
         VALUES ('s1', 'r1', 'device-a', 'u1', '2026-09-30T12:00:00.000Z', 0, 'OPEN');
         INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at)
         VALUES ('sale-1', 'r1', 'device-a', 's1', 'u1', 'COMPLETED', '2026-09-30T12:05:00.000Z');
         INSERT INTO products (id, name, category_id, sale_unit, active, version)
         VALUES ('p-kg', 'Yerba a granel', 'c', 'KG', 1, 1),
                ('p-unit', 'Alfajor', 'c', 'UNIT', 1, 1);
         INSERT INTO sale_lines (id, sale_id, position, product_id, product_name, quantity, list_unit_price, price_list_id, line_total)
         VALUES ('line-kg', 'sale-1', 1, 'p-kg', 'Yerba a granel', 350, 1890000, 'list-1', 661500),
                ('line-unit', 'sale-1', 2, 'p-unit', 'Alfajor', 2, 42000, 'list-1', 84000);`,
      );
      before.close();

      const after = openLocalDatabase(path, LOCAL_MIGRATIONS, migrationClock);

      expect(after.prepare("SELECT id, sale_unit FROM sale_lines ORDER BY position").all()).toEqual(
        [
          { id: "line-kg", sale_unit: "KG" },
          { id: "line-unit", sale_unit: "UNIT" },
        ],
      );
      expect(() =>
        after.exec("UPDATE sale_lines SET sale_unit = 'LITRE' WHERE id = 'line-kg'"),
      ).toThrow(/CHECK/);
      expect(() =>
        after.exec("UPDATE sale_lines SET sale_unit = NULL WHERE id = 'line-kg'"),
      ).toThrow(/NOT NULL/);

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
                ('sale-3', 'r1', 'device-a', 's1', 'u1', 'COMPLETED', '2026-09-30T12:06:30.000Z', NULL),
                ('sale-4', 'r1', 'device-a', 's1', 'u1', 'COMPLETED', '2026-09-30T12:06:40.000Z', NULL)`,
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
        `INSERT INTO sale_reprints (sale_id, document, order_number, requested_by, authorized_by, reason_kind, reason_text, occurred_at)
         VALUES (@sale_id, 'sale_receipt', @order_number, 'u1', NULL, @reason_kind, @reason_text, '2026-09-30T12:10:00.000Z')`,
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

  it("let a payment be a Mercado Pago QR payment in any state of its wait, keeping the payments and refunds a register already holds", () => {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const path = join(folder, "register.sqlite");
      const previous = LOCAL_MIGRATIONS.slice(
        0,
        LOCAL_MIGRATIONS.findIndex(
          (migration) => migration.name === "0028_mercado_pago_qr_payments",
        ),
      );
      expect(previous.length).toBeGreaterThan(0);
      const before = openLocalDatabase(path, previous, migrationClock);
      before.exec(
        `INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
         VALUES ('s1', 'r1', 'device-a', 'u1', '2026-09-30T12:00:00.000Z', 0, 'OPEN');
         INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at)
         VALUES ('done', 'r1', 'device-a', 's1', 'u1', 'COMPLETED', '2026-09-30T12:05:00.000Z'),
                ('open', 'r1', 'device-a', 's1', 'u1', 'OPEN', NULL);
         INSERT INTO payment_transactions (id, sale_id, kind, method, provider, amount, tendered, authorized_by, confirmed_at, state, occurred_at)
         VALUES ('pay-cash', 'done', 'SALE', 'CASH', 'NONE', 1000, 1500, NULL, NULL, 'APPROVED', '2026-09-30T12:05:00.000Z'),
                ('pay-transfer', 'open', 'SALE', 'TRANSFER', 'NONE', 400, NULL, 'u1', '2026-09-30T12:08:00.000Z', 'APPROVED', '2026-09-30T12:08:00.000Z');
         INSERT INTO payment_refunds (id, payment_id, method, provider, amount, state, occurred_at)
         VALUES ('refund-1', 'pay-cash', 'CASH', 'NONE', 1000, 'APPROVED', '2026-09-30T12:20:00.000Z');`,
      );
      before.close();

      const after = openLocalDatabase(path, LOCAL_MIGRATIONS, migrationClock);

      expect(
        after
          .prepare(
            `SELECT id, sale_id, method, provider, amount, tendered, authorized_by, confirmed_at, state,
                    occurred_at, wait_ends_at
             FROM payment_transactions ORDER BY id`,
          )
          .all(),
      ).toEqual([
        {
          id: "pay-cash",
          sale_id: "done",
          method: "CASH",
          provider: "NONE",
          amount: 1000,
          tendered: 1500,
          authorized_by: null,
          confirmed_at: null,
          state: "APPROVED",
          occurred_at: "2026-09-30T12:05:00.000Z",
          wait_ends_at: null,
        },
        {
          id: "pay-transfer",
          sale_id: "open",
          method: "TRANSFER",
          provider: "NONE",
          amount: 400,
          tendered: null,
          authorized_by: "u1",
          confirmed_at: "2026-09-30T12:08:00.000Z",
          state: "APPROVED",
          occurred_at: "2026-09-30T12:08:00.000Z",
          wait_ends_at: null,
        },
      ]);
      expect(after.prepare("SELECT id, payment_id FROM payment_refunds").all()).toEqual([
        { id: "refund-1", payment_id: "pay-cash" },
      ]);

      const insertPayment = after.prepare(
        `INSERT INTO payment_transactions (id, sale_id, kind, method, provider, amount, tendered, authorized_by, confirmed_at, state, occurred_at, wait_ends_at)
         VALUES (@id, 'open', 'SALE', @method, @provider, 600, @tendered, @authorized_by, NULL, @state, '2026-09-30T12:10:00.000Z', @wait_ends_at)`,
      );
      const qr = {
        method: "QR",
        provider: "MERCADOPAGO_QR",
        tendered: null,
        authorized_by: null,
        state: "PENDING",
        wait_ends_at: "2026-09-30T12:13:00.000Z",
      };
      for (const [id, state] of [
        ["qr-pending", "PENDING"],
        ["qr-approved", "APPROVED"],
        ["qr-declined", "DECLINED"],
        ["qr-cancelled", "CANCELLED"],
        ["qr-expired", "EXPIRED"],
      ]) {
        insertPayment.run({ ...qr, id, state });
      }
      expect(
        after
          .prepare("SELECT count(*) AS total FROM payment_transactions WHERE method = 'QR'")
          .get(),
      ).toEqual({ total: 5 });
      after
        .prepare("UPDATE payment_transactions SET state = 'APPROVED' WHERE id = 'qr-pending'")
        .run();
      expect(after.pragma("foreign_key_check")).toEqual([]);

      expect(() => insertPayment.run({ ...qr, id: "no-wait", wait_ends_at: null })).toThrow(
        /CHECK/,
      );
      expect(() => insertPayment.run({ ...qr, id: "no-provider", provider: "NONE" })).toThrow(
        /CHECK/,
      );
      expect(() => insertPayment.run({ ...qr, id: "tendered", tendered: 600 })).toThrow(/CHECK/);
      expect(() => insertPayment.run({ ...qr, id: "authorized", authorized_by: "u1" })).toThrow(
        /CHECK/,
      );
      expect(() => insertPayment.run({ ...qr, id: "unknown", state: "REFUNDED" })).toThrow(/CHECK/);
      expect(() =>
        insertPayment.run({
          ...qr,
          id: "cash-pending",
          method: "CASH",
          provider: "NONE",
          wait_ends_at: null,
        }),
      ).toThrow(/CHECK/);
      expect(() =>
        insertPayment.run({
          ...qr,
          id: "cash-waiting",
          method: "CASH",
          provider: "NONE",
          state: "APPROVED",
        }),
      ).toThrow(/CHECK/);
      expect(() =>
        insertPayment.run({
          ...qr,
          id: "cash-by-provider",
          method: "CASH",
          state: "APPROVED",
          wait_ends_at: null,
        }),
      ).toThrow(/CHECK/);
      after.close();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("rebuild the stock ledger over the register's own sale movements, to hold movements pulled from the cloud", () => {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const path = join(folder, "register.sqlite");
      const previous = LOCAL_MIGRATIONS.slice(0, 26);
      expect(previous.at(-1)?.name).toBe("0025_last_accepted_push");
      const throughRebuild = LOCAL_MIGRATIONS.slice(0, 27);
      expect(throughRebuild.at(-1)?.name).toBe("0026_pulled_stock_movements");
      const before = openLocalDatabase(path, previous, migrationClock);
      before.exec(
        `INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
         VALUES ('s1', 'r1', 'device-a', 'u1', '2026-09-30T12:00:00.000Z', 0, 'OPEN');
         INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at)
         VALUES ('sale-1', 'r1', 'device-a', 's1', 'u1', 'COMPLETED', '2026-09-30T12:05:00.000Z');
         INSERT INTO sale_lines (id, sale_id, position, product_id, product_name, quantity, list_unit_price, price_list_id, line_total)
         VALUES ('line-1', 'sale-1', 1, 'p1', 'Yerba', 1, 1500, 'list-1', 1500);
         INSERT INTO stock_movements (id, product_id, kind, sale_line_id, delta, occurred_at)
         VALUES ('own-movement', 'p1', 'sale', 'line-1', -1000, '2026-09-30T12:05:00.000Z');
         INSERT INTO stock_balances (product_id, quantity) VALUES ('p1', 9000);`,
      );
      before.close();

      const after = openLocalDatabase(path, throughRebuild, migrationClock);

      expect(after.prepare("SELECT * FROM stock_movements").all()).toEqual([
        {
          id: "own-movement",
          product_id: "p1",
          kind: "sale",
          sale_line_id: "line-1",
          delta: -1000,
          occurred_at: "2026-09-30T12:05:00.000Z",
          superseded_by_count_id: null,
        },
      ]);
      expect(after.prepare("SELECT * FROM stock_balances").all()).toEqual([
        { product_id: "p1", quantity: 9000 },
      ]);
      const insert = after.prepare(
        `INSERT INTO stock_movements (id, product_id, kind, sale_line_id, delta, occurred_at, superseded_by_count_id)
         VALUES (@id, 'p1', @kind, @sale_line_id, -1000, '2026-09-30T12:05:00.000Z', @superseded_by_count_id)`,
      );
      for (const kind of ["sale", "loss", "adjustment", "count"]) {
        insert.run({
          id: `pulled-${kind}`,
          kind,
          sale_line_id: null,
          superseded_by_count_id: null,
        });
      }
      insert.run({
        id: "pulled-superseded",
        kind: "sale",
        sale_line_id: null,
        superseded_by_count_id: "pulled-count",
      });
      expect(() =>
        insert.run({
          id: "pulled-receipt",
          kind: "receipt",
          sale_line_id: null,
          superseded_by_count_id: null,
        }),
      ).toThrow(/CHECK/);
      expect(() =>
        insert.run({
          id: "loss-of-a-line",
          kind: "loss",
          sale_line_id: "line-1",
          superseded_by_count_id: null,
        }),
      ).toThrow(/CHECK/);
      expect(() =>
        insert.run({
          id: "sale-of-a-missing-line",
          kind: "sale",
          sale_line_id: "missing",
          superseded_by_count_id: null,
        }),
      ).toThrow(/FOREIGN KEY/);
      after.close();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("add the register's offline point of sale beside the data a register already holds", () => {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const path = join(folder, "register.sqlite");
      const previous = LOCAL_MIGRATIONS.filter(
        (migration) => migration.name < "0029_register_offline_point_of_sale",
      );
      expect(LOCAL_MIGRATIONS.map((migration) => migration.name)).toContain(
        "0029_register_offline_point_of_sale",
      );
      const before = openLocalDatabase(path, previous, migrationClock);
      before
        .prepare(
          `INSERT INTO register_point_of_sale (register_id, point_of_sale_number, fiscal_address_id, version)
           VALUES ('r1', 12, 'address-1', 3)`,
        )
        .run();
      before.close();

      const after = openLocalDatabase(path, LOCAL_MIGRATIONS, migrationClock);

      expect(after.prepare("SELECT * FROM register_offline_point_of_sale").all()).toEqual([]);
      expect(
        after
          .prepare("SELECT register_id, point_of_sale_number, version FROM register_point_of_sale")
          .all(),
      ).toEqual([{ register_id: "r1", point_of_sale_number: 12, version: 3 }]);
      const insert = after.prepare(
        "INSERT INTO register_offline_point_of_sale (register_id, point_of_sale_number, version) VALUES (?, ?, 1)",
      );
      expect(() => insert.run("r1", 0)).toThrow();
      expect(() => insert.run("r1", 100000)).toThrow();
      expect(() => insert.run("r1", 99999)).not.toThrow();
      after.close();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("add the offline authorization codes and number blocks beside the data a register already holds", () => {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const path = join(folder, "register.sqlite");
      const previous = LOCAL_MIGRATIONS.filter(
        (migration) => migration.name < "0032_offline_numbering",
      );
      expect(LOCAL_MIGRATIONS.map((migration) => migration.name)).toContain(
        "0032_offline_numbering",
      );
      const before = openLocalDatabase(path, previous, migrationClock);
      before
        .prepare(
          `INSERT INTO register_offline_point_of_sale (register_id, point_of_sale_number, version)
           VALUES ('r1', 31, 2)`,
        )
        .run();
      before.close();

      const after = openLocalDatabase(path, LOCAL_MIGRATIONS, migrationClock);

      expect(after.prepare("SELECT * FROM offline_authorization_codes").all()).toEqual([]);
      expect(after.prepare("SELECT * FROM offline_number_blocks").all()).toEqual([]);
      expect(
        after
          .prepare("SELECT register_id, point_of_sale_number FROM register_offline_point_of_sale")
          .all(),
      ).toEqual([{ register_id: "r1", point_of_sale_number: 31 }]);
      const insertBlock = after.prepare(
        `INSERT INTO offline_number_blocks (
           id, point_of_sale, document_type, first_number, last_number, status, version
         ) VALUES (@id, @point_of_sale, @document_type, @first_number, @last_number, @status, 1)`,
      );
      const block = {
        id: "b1",
        point_of_sale: 31,
        document_type: "factura_c",
        first_number: 1,
        last_number: 1000,
        status: "in_use",
      };
      expect(() => insertBlock.run({ ...block, id: "b2", point_of_sale: 0 })).toThrow();
      expect(() => insertBlock.run({ ...block, id: "b2", point_of_sale: 100000 })).toThrow();
      expect(() => insertBlock.run({ ...block, id: "b2", document_type: "FACTURA_C" })).toThrow();
      expect(() => insertBlock.run({ ...block, id: "b2", status: "closed" })).toThrow();
      expect(() => insertBlock.run({ ...block, id: "b2", first_number: 0 })).toThrow();
      expect(() => insertBlock.run({ ...block, id: "b2", last_number: 0 })).toThrow();
      expect(() => insertBlock.run(block)).not.toThrow();
      expect(() => insertBlock.run({ ...block, id: "b3", last_number: 2000 })).toThrow();
      after.close();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("let the stock ledger hold the receipts a register pulls, over the movements it already holds", () => {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const path = join(folder, "register.sqlite");
      const previous = LOCAL_MIGRATIONS.filter(
        (migration) => migration.name < "0030_stock_receipts",
      );
      expect(LOCAL_MIGRATIONS.map((migration) => migration.name)).toContain("0030_stock_receipts");
      const before = openLocalDatabase(path, previous, migrationClock);
      before.exec(
        `INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
         VALUES ('s1', 'r1', 'device-a', 'u1', '2026-10-09T12:00:00.000Z', 0, 'OPEN');
         INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at)
         VALUES ('sale-1', 'r1', 'device-a', 's1', 'u1', 'COMPLETED', '2026-10-09T12:05:00.000Z');
         INSERT INTO sale_lines (id, sale_id, position, product_id, product_name, quantity, list_unit_price, price_list_id, line_total)
         VALUES ('line-1', 'sale-1', 1, 'p1', 'Yerba', 1, 1500, 'list-1', 1500);
         INSERT INTO stock_movements (id, product_id, kind, sale_line_id, delta, occurred_at, superseded_by_count_id)
         VALUES ('own-movement', 'p1', 'sale', 'line-1', -1000, '2026-10-09T12:05:00.000Z', 'pulled-count'),
                ('pulled-count', 'p1', 'count', NULL, 2000, '2026-10-09T13:00:00.000Z', NULL);
         INSERT INTO stock_balances (product_id, quantity) VALUES ('p1', 9000);`,
      );
      before.close();

      const after = openLocalDatabase(path, LOCAL_MIGRATIONS, migrationClock);

      expect(after.prepare("SELECT * FROM stock_movements ORDER BY id").all()).toEqual([
        {
          id: "own-movement",
          product_id: "p1",
          kind: "sale",
          sale_line_id: "line-1",
          delta: -1000,
          occurred_at: "2026-10-09T12:05:00.000Z",
          superseded_by_count_id: "pulled-count",
          expires_on: null,
          withdraws_movement_id: null,
        },
        {
          id: "pulled-count",
          product_id: "p1",
          kind: "count",
          sale_line_id: null,
          delta: 2000,
          occurred_at: "2026-10-09T13:00:00.000Z",
          superseded_by_count_id: null,
          expires_on: null,
          withdraws_movement_id: null,
        },
      ]);
      expect(after.prepare("SELECT * FROM stock_balances").all()).toEqual([
        { product_id: "p1", quantity: 9000 },
      ]);
      const insert = after.prepare(
        `INSERT INTO stock_movements (id, product_id, kind, sale_line_id, delta, occurred_at)
         VALUES (@id, 'p1', @kind, @sale_line_id, 6000, '2026-10-09T14:00:00.000Z')`,
      );
      expect(() =>
        insert.run({ id: "pulled-receipt", kind: "receipt", sale_line_id: null }),
      ).not.toThrow();
      expect(() =>
        insert.run({ id: "unknown-kind", kind: "transfer", sale_line_id: null }),
      ).toThrow(/CHECK/);
      expect(() =>
        insert.run({ id: "receipt-of-a-line", kind: "receipt", sale_line_id: "line-1" }),
      ).toThrow(/CHECK/);
      after.close();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("add the receipt printer's address with no address set over the register that already holds data", () => {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const path = join(folder, "register.sqlite");
      const previous = LOCAL_MIGRATIONS.filter(
        (migration) => migration.name < "0031_receipt_printer",
      );
      expect(LOCAL_MIGRATIONS.map((migration) => migration.name)).toContain("0031_receipt_printer");
      const before = openLocalDatabase(path, previous, migrationClock);
      before.prepare("UPDATE sync_state SET pull_cursor = 9 WHERE id = 1").run();
      before.close();

      const after = openLocalDatabase(path, LOCAL_MIGRATIONS, migrationClock);

      expect(after.prepare("SELECT * FROM receipt_printer").all()).toEqual([]);
      expect(after.prepare("SELECT pull_cursor FROM sync_state").get()).toEqual({
        pull_cursor: 9,
      });
      after.close();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  describe("the receipt printer's address", () => {
    function insert(values: { id?: number; host?: string | null; port?: number | null }) {
      const database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
      const run = () =>
        database
          .prepare("INSERT INTO receipt_printer (id, host, port) VALUES (@id, @host, @port)")
          .run({ id: 1, host: "10.10.10.2", port: null, ...values });
      return { database, run };
    }

    it("holds one address, with or without a port", () => {
      const withoutPort = insert({});
      const withPort = insert({ port: 9100 });

      expect(withoutPort.run).not.toThrow();
      expect(withPort.run).not.toThrow();
      withoutPort.database.close();
      withPort.database.close();
    });

    it("refuses a second address, a missing host and a port outside 1 to 65535", () => {
      const held = insert({});
      held.run();

      expect(() =>
        held.database
          .prepare("INSERT INTO receipt_printer (id, host, port) VALUES (2, 'printer', NULL)")
          .run(),
      ).toThrow(/CHECK/);
      expect(insert({ host: null }).run).toThrow(/NOT NULL/);
      expect(insert({ port: 0 }).run).toThrow(/CHECK/);
      expect(insert({ port: 65536 }).run).toThrow(/CHECK/);
      expect(insert({ port: 65535 }).run).not.toThrow();
      held.database.close();
    });
  });

  it("add the serial devices with none registered over the register that already holds data", () => {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const path = join(folder, "register.sqlite");
      const previous = LOCAL_MIGRATIONS.filter(
        (migration) => migration.name < "0034_serial_devices",
      );
      expect(LOCAL_MIGRATIONS.map((migration) => migration.name)).toContain("0034_serial_devices");
      const before = openLocalDatabase(path, previous, migrationClock);
      before.prepare("UPDATE sync_state SET pull_cursor = 11 WHERE id = 1").run();
      before.close();

      const after = openLocalDatabase(path, LOCAL_MIGRATIONS, migrationClock);

      expect(after.prepare("SELECT * FROM serial_devices").all()).toEqual([]);
      expect(after.prepare("SELECT pull_cursor FROM sync_state").get()).toEqual({
        pull_cursor: 11,
      });
      after.close();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  describe("the registered serial devices", () => {
    function insert(values: {
      role?: string | null;
      vendor_id?: string | null;
      product_id?: string | null;
    }) {
      const database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
      const run = () =>
        database
          .prepare(
            "INSERT INTO serial_devices (role, vendor_id, product_id) VALUES (@role, @vendor_id, @product_id)",
          )
          .run({ role: "scale", vendor_id: "26f1", product_id: "8802", ...values });
      return { database, run };
    }

    it("holds one device for the scale and one for the reader", () => {
      const held = insert({});
      held.run();

      expect(() =>
        held.database.prepare("INSERT INTO serial_devices VALUES ('reader', '1a86', '7523')").run(),
      ).not.toThrow();
      held.database.close();
    });

    it("refuses a role other than scale and reader, a missing role and a second device for one role", () => {
      const held = insert({});
      held.run();

      expect(insert({ role: "printer" }).run).toThrow(/CHECK/);
      expect(insert({ role: null }).run).toThrow(/NOT NULL/);
      expect(() =>
        held.database.prepare("INSERT INTO serial_devices VALUES ('scale', '1a86', '7523')").run(),
      ).toThrow(/UNIQUE|PRIMARY KEY/);
      held.database.close();
    });

    it("refuses the same vendor and product for both roles", () => {
      const held = insert({});
      held.run();

      expect(() =>
        held.database.prepare("INSERT INTO serial_devices VALUES ('reader', '26f1', '8802')").run(),
      ).toThrow(/UNIQUE/);
      held.database.close();
    });

    it("refuses a vendor or product that is not four lowercase hexadecimal digits", () => {
      expect(insert({ vendor_id: "26F1" }).run).toThrow(/CHECK/);
      expect(insert({ product_id: "880" }).run).toThrow(/CHECK/);
      expect(insert({ vendor_id: "26f10" }).run).toThrow(/CHECK/);
      expect(insert({ product_id: "88g2" }).run).toThrow(/CHECK/);
      expect(insert({ vendor_id: "" }).run).toThrow(/CHECK/);
      expect(insert({ vendor_id: null }).run).toThrow(/NOT NULL/);
      expect(insert({ product_id: null }).run).toThrow(/NOT NULL/);
      expect(insert({ vendor_id: "0000", product_id: "ffff" }).run).not.toThrow();
    });
  });

  it("let a sale hold a product weighed several times and tell where each weight came from, over the lines it already holds", () => {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const path = join(folder, "register.sqlite");
      const previous = LOCAL_MIGRATIONS.filter(
        (migration) => migration.name < "0033_weighed_sale_lines",
      );
      expect(LOCAL_MIGRATIONS.map((migration) => migration.name)).toContain(
        "0033_weighed_sale_lines",
      );
      const before = openLocalDatabase(path, previous, migrationClock);
      before.exec(
        `INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
         VALUES ('s1', 'r1', 'device-a', 'u1', '2026-10-09T12:00:00.000Z', 0, 'OPEN');
         INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at)
         VALUES ('sale-1', 'r1', 'device-a', 's1', 'u1', 'COMPLETED', '2026-10-09T12:05:00.000Z');
         INSERT INTO sale_lines (id, sale_id, position, product_id, product_name, quantity, list_unit_price, price_list_id, line_total, promotion_id, discount_amount)
         VALUES ('line-1', 'sale-1', 1, 'p1', 'Yerba', 2, 1500, 'list-1', 2700, 'd1', 300);
         INSERT INTO discounts (id, name, kind, percent, buy_qty, pay_qty, target_kind, target_id, valid_from, valid_to, weekdays, active, version)
         VALUES ('d1', 'Diez por ciento', 'PERCENT_OFF', 10, NULL, NULL, 'PRODUCT', 'p1', '2026-09-01', '2026-12-31', '[]', 1, 1);
         INSERT INTO sale_line_promotions (line_id, discount_id, kind, percent)
         VALUES ('line-1', 'd1', 'PERCENT_OFF', 10);
         INSERT INTO sale_lines (id, sale_id, position, product_id, product_name, sale_unit, quantity, list_unit_price, price_list_id, line_total)
         VALUES ('line-kg', 'sale-1', 2, 'p2', 'Queso', 'KG', 350, 9000, 'list-1', 3150);
         INSERT INTO stock_movements (id, product_id, kind, sale_line_id, delta, occurred_at)
         VALUES ('movement-1', 'p1', 'sale', 'line-1', -2000, '2026-10-09T12:05:00.000Z');`,
      );
      before.close();

      const after = openLocalDatabase(path, LOCAL_MIGRATIONS, migrationClock);

      expect(
        after
          .prepare(
            `SELECT id, sale_id, position, product_id, product_name, quantity, list_unit_price,
                    price_list_id, line_total, promotion_id, discount_amount, sale_unit, weight_source
             FROM sale_lines ORDER BY position`,
          )
          .all(),
      ).toEqual([
        {
          id: "line-1",
          sale_id: "sale-1",
          position: 1,
          product_id: "p1",
          product_name: "Yerba",
          quantity: 2,
          list_unit_price: 1500,
          price_list_id: "list-1",
          line_total: 2700,
          promotion_id: "d1",
          discount_amount: 300,
          sale_unit: "UNIT",
          weight_source: null,
        },
        {
          id: "line-kg",
          sale_id: "sale-1",
          position: 2,
          product_id: "p2",
          product_name: "Queso",
          quantity: 350,
          list_unit_price: 9000,
          price_list_id: "list-1",
          line_total: 3150,
          promotion_id: null,
          discount_amount: 0,
          sale_unit: "KG",
          weight_source: "MANUAL",
        },
      ]);
      expect(after.prepare("SELECT line_id, discount_id FROM sale_line_promotions").all()).toEqual([
        { line_id: "line-1", discount_id: "d1" },
      ]);
      expect(after.prepare("SELECT sale_line_id FROM stock_movements").all()).toEqual([
        { sale_line_id: "line-1" },
      ]);
      expect(after.pragma("foreign_key_check")).toEqual([]);
      expect(
        after
          .prepare(
            "SELECT name FROM sqlite_schema WHERE type = 'index' AND tbl_name = 'sale_lines'",
          )
          .all(),
      ).toContainEqual({ name: "sale_lines_by_product" });
      const insert = after.prepare(
        `INSERT INTO sale_lines (id, sale_id, position, product_id, product_name, sale_unit, weight_source, quantity, list_unit_price, price_list_id, line_total)
         VALUES (@id, 'sale-1', @position, 'p1', 'Queso', @sale_unit, @weight_source, 1250, 9000, 'list-1', 11250)`,
      );
      const weighed = { sale_unit: "KG", weight_source: "MANUAL" };
      expect(() => insert.run({ id: "line-2", position: 3, ...weighed })).not.toThrow();
      expect(() => insert.run({ id: "line-3", position: 4, ...weighed })).not.toThrow();
      expect(() =>
        insert.run({ id: "line-4", position: 5, sale_unit: "KG", weight_source: "SCALE" }),
      ).not.toThrow();
      expect(() =>
        insert.run({ id: "line-5", position: 6, sale_unit: "UNIT", weight_source: null }),
      ).not.toThrow();
      expect(() => insert.run({ id: "line-6", position: 3, ...weighed })).toThrow(/UNIQUE/);
      expect(() =>
        insert.run({ id: "line-7", position: 7, sale_unit: "KG", weight_source: null }),
      ).toThrow(/CHECK/);
      expect(() =>
        insert.run({ id: "line-8", position: 8, sale_unit: "UNIT", weight_source: "MANUAL" }),
      ).toThrow(/CHECK/);
      expect(() =>
        insert.run({ id: "line-9", position: 9, sale_unit: "KG", weight_source: "SENSOR" }),
      ).toThrow(/CHECK/);
      after.close();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("spell the fiscal documents' type as the domain does, over the documents a register already holds", () => {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const path = join(folder, "register.sqlite");
      const previous = LOCAL_MIGRATIONS.filter(
        (migration) => migration.name < "0035_domain_fiscal_document_type",
      );
      expect(LOCAL_MIGRATIONS.map((migration) => migration.name)).toContain(
        "0035_domain_fiscal_document_type",
      );
      const before = openLocalDatabase(path, previous, migrationClock);
      before.exec(
        `INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
         VALUES ('s1', 'r1', 'device-a', 'u1', '2026-10-09T12:00:00.000Z', 0, 'OPEN');
         INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at)
         VALUES ('sale-1', 'r1', 'device-a', 's1', 'u1', 'COMPLETED', '2026-10-09T12:05:00.000Z'),
                ('sale-2', 'r1', 'device-a', 's1', 'u1', 'COMPLETED', '2026-10-09T12:06:00.000Z');
         INSERT INTO fiscal_documents (
           id, sale_id, point_of_sale, document_type, number, issued_on, document, state,
           authorization_code, authorization_code_due_on, reserved_at, resolved_at
         ) VALUES
           ('doc-1', 'sale-1', 12, 'FACTURA_C', 41, '2026-10-09', '{"total":1500}', 'AUTHORIZED',
            '75123456789012', '2026-10-19', '2026-10-09T12:05:00.000Z', '2026-10-09T12:05:01.000Z'),
           ('doc-2', 'sale-2', 12, 'FACTURA_C', 42, '2026-10-09', '{"total":2500}', 'REQUESTING',
            NULL, NULL, '2026-10-09T12:06:00.000Z', NULL);`,
      );
      before.close();

      const after = openLocalDatabase(path, LOCAL_MIGRATIONS, migrationClock);

      expect(after.prepare("SELECT * FROM fiscal_documents ORDER BY id").all()).toEqual([
        {
          id: "doc-1",
          sale_id: "sale-1",
          point_of_sale: 12,
          document_type: "factura_c",
          number: 41,
          issued_on: "2026-10-09",
          document: '{"total":1500}',
          state: "AUTHORIZED",
          authorization_code: "75123456789012",
          authorization_code_due_on: "2026-10-19",
          reserved_at: "2026-10-09T12:05:00.000Z",
          resolved_at: "2026-10-09T12:05:01.000Z",
        },
        {
          id: "doc-2",
          sale_id: "sale-2",
          point_of_sale: 12,
          document_type: "factura_c",
          number: 42,
          issued_on: "2026-10-09",
          document: '{"total":2500}',
          state: "REQUESTING",
          authorization_code: null,
          authorization_code_due_on: null,
          reserved_at: "2026-10-09T12:06:00.000Z",
          resolved_at: null,
        },
      ]);
      expect(after.pragma("foreign_key_check")).toEqual([]);
      expect(
        after
          .prepare(
            "SELECT name FROM sqlite_schema WHERE type = 'index' AND tbl_name = 'fiscal_documents' AND sql IS NOT NULL ORDER BY name",
          )
          .all(),
      ).toEqual([
        { name: "fiscal_documents_number_in_use" },
        { name: "fiscal_documents_one_open_per_sale" },
        { name: "fiscal_documents_one_waiting" },
      ]);
      after.close();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("let a pending QR payment be marked as replaced, none being so over the payments a register already holds", () => {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const path = join(folder, "register.sqlite");
      const previous = LOCAL_MIGRATIONS.filter(
        (migration) => migration.name < "0036_replaced_qr_payments",
      );
      expect(LOCAL_MIGRATIONS.map((migration) => migration.name)).toContain(
        "0036_replaced_qr_payments",
      );
      const before = openLocalDatabase(path, previous, migrationClock);
      before.exec(
        `INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
         VALUES ('s1', 'r1', 'device-a', 'u1', '2026-10-09T12:00:00.000Z', 0, 'OPEN');
         INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at)
         VALUES ('open', 'r1', 'device-a', 's1', 'u1', 'OPEN', NULL);
         INSERT INTO payment_transactions (id, sale_id, kind, method, provider, amount, tendered, authorized_by, confirmed_at, state, occurred_at, wait_ends_at)
         VALUES ('pay-cash', 'open', 'SALE', 'CASH', 'NONE', 1000, 1500, NULL, NULL, 'APPROVED', '2026-10-09T12:05:00.000Z', NULL),
                ('pay-qr', 'open', 'SALE', 'QR', 'MERCADOPAGO_QR', 600, NULL, NULL, NULL, 'PENDING', '2026-10-09T12:06:00.000Z', '2026-10-09T12:09:00.000Z');`,
      );
      before.close();

      const after = openLocalDatabase(path, LOCAL_MIGRATIONS, migrationClock);

      expect(
        after.prepare("SELECT id, state, replaced FROM payment_transactions ORDER BY id").all(),
      ).toEqual([
        { id: "pay-cash", state: "APPROVED", replaced: 0 },
        { id: "pay-qr", state: "PENDING", replaced: 0 },
      ]);
      after.prepare("UPDATE payment_transactions SET replaced = 1 WHERE id = 'pay-qr'").run();
      expect(
        after.prepare("SELECT replaced FROM payment_transactions WHERE id = 'pay-qr'").get(),
      ).toEqual({ replaced: 1 });
      expect(() =>
        after.prepare("UPDATE payment_transactions SET replaced = 1 WHERE id = 'pay-cash'").run(),
      ).toThrow(/CHECK/);
      expect(() =>
        after.prepare("UPDATE payment_transactions SET replaced = 2 WHERE id = 'pay-qr'").run(),
      ).toThrow(/CHECK/);
      expect(() =>
        after.prepare("UPDATE payment_transactions SET replaced = NULL WHERE id = 'pay-qr'").run(),
      ).toThrow(/NOT NULL/);
      expect(after.pragma("foreign_key_check")).toEqual([]);
      after.close();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("keep the promotions frozen on a sale's lines and name each with the promotion's name, refusing to migrate one whose promotion is unknown", () => {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const path = join(folder, "register.sqlite");
      const previous = LOCAL_MIGRATIONS.filter(
        (migration) => migration.name < "0047_sale_line_promotion_names",
      );
      expect(LOCAL_MIGRATIONS.map((migration) => migration.name)).toContain(
        "0047_sale_line_promotion_names",
      );
      const before = openLocalDatabase(path, previous, migrationClock);
      before.exec(
        `INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
         VALUES ('s1', 'r1', 'device-a', 'u1', '2026-10-09T12:00:00.000Z', 0, 'OPEN');
         INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at)
         VALUES ('sale-1', 'r1', 'device-a', 's1', 'u1', 'COMPLETED', '2026-10-09T12:05:00.000Z');
         INSERT INTO sale_lines (id, sale_id, position, product_id, product_name, quantity, list_unit_price, price_list_id, line_total, promotion_id, discount_amount)
         VALUES ('line-1', 'sale-1', 1, 'p1', 'Yerba', 3, 1500, 'list-1', 3600, 'd-percent', 900);
         INSERT INTO discounts (id, name, kind, percent, buy_qty, pay_qty, target_kind, target_id, valid_from, valid_to, weekdays, active, version)
         VALUES ('d-percent', 'Promo 20% en la segunda', 'PERCENT_OFF', 20, NULL, NULL, 'PRODUCT', 'p1', '2026-09-01', '2026-12-31', '[]', 1, 1),
                ('d-3x2', 'Lleve 3, pague 2', 'BUY_N_PAY_M', NULL, 3, 2, 'PRODUCT', 'p1', '2026-09-01', '2026-12-31', '[]', 1, 1);
         INSERT INTO sale_line_promotions (line_id, discount_id, kind, percent, buy_qty, pay_qty)
         VALUES ('line-1', 'd-percent', 'PERCENT_OFF', 20, NULL, NULL),
                ('line-1', 'd-3x2', 'BUY_N_PAY_M', NULL, 3, 2);`,
      );
      before.close();

      const after = openLocalDatabase(path, LOCAL_MIGRATIONS, migrationClock);

      expect(
        after
          .prepare(
            `SELECT line_id, discount_id, name, kind, percent, buy_qty, pay_qty
             FROM sale_line_promotions ORDER BY discount_id`,
          )
          .all(),
      ).toEqual([
        {
          line_id: "line-1",
          discount_id: "d-3x2",
          name: "Lleve 3, pague 2",
          kind: "BUY_N_PAY_M",
          percent: null,
          buy_qty: 3,
          pay_qty: 2,
        },
        {
          line_id: "line-1",
          discount_id: "d-percent",
          name: "Promo 20% en la segunda",
          kind: "PERCENT_OFF",
          percent: 20,
          buy_qty: null,
          pay_qty: null,
        },
      ]);
      expect(() =>
        after
          .prepare(
            "INSERT INTO sale_line_promotions (line_id, discount_id, name, kind, percent) VALUES ('line-1', 'd-new', NULL, 'PERCENT_OFF', 10)",
          )
          .run(),
      ).toThrow(/NOT NULL/);
      expect(() =>
        after
          .prepare(
            "INSERT INTO sale_line_promotions (line_id, discount_id, name, kind, percent) VALUES ('missing', 'd-new', 'Promo', 'PERCENT_OFF', 10)",
          )
          .run(),
      ).toThrow(/FOREIGN KEY/);
      expect(after.pragma("foreign_key_check")).toEqual([]);
      after.close();

      const orphan = openLocalDatabase(join(folder, "orphan.sqlite"), previous, migrationClock);
      orphan.exec(
        `INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
         VALUES ('s1', 'r1', 'device-a', 'u1', '2026-10-09T12:00:00.000Z', 0, 'OPEN');
         INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at)
         VALUES ('sale-1', 'r1', 'device-a', 's1', 'u1', 'COMPLETED', '2026-10-09T12:05:00.000Z');
         INSERT INTO sale_lines (id, sale_id, position, product_id, product_name, quantity, list_unit_price, price_list_id, line_total)
         VALUES ('line-1', 'sale-1', 1, 'p1', 'Yerba', 1, 1500, 'list-1', 1200);
         INSERT INTO sale_line_promotions (line_id, discount_id, kind, percent)
         VALUES ('line-1', 'unknown', 'PERCENT_OFF', 20);`,
      );
      orphan.close();

      expect(() =>
        openLocalDatabase(join(folder, "orphan.sqlite"), LOCAL_MIGRATIONS, migrationClock),
      ).toThrow(/NOT NULL/);
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("let a payment be an integrated terminal payment in any state of its wait, keeping the payments and refunds a register already holds", () => {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const path = join(folder, "register.sqlite");
      const previous = LOCAL_MIGRATIONS.filter(
        (migration) => migration.name < "0043_integrated_terminal_payments",
      );
      expect(LOCAL_MIGRATIONS.map((migration) => migration.name)).toContain(
        "0043_integrated_terminal_payments",
      );
      const before = openLocalDatabase(path, previous, migrationClock);
      before.exec(
        `INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
         VALUES ('s1', 'r1', 'device-a', 'u1', '2026-10-09T12:00:00.000Z', 0, 'OPEN');
         INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at)
         VALUES ('done', 'r1', 'device-a', 's1', 'u1', 'COMPLETED', '2026-10-09T12:05:00.000Z'),
                ('open', 'r1', 'device-a', 's1', 'u1', 'OPEN', NULL);
         INSERT INTO payment_transactions (id, sale_id, kind, method, provider, amount, tendered, authorized_by, confirmed_at, state, occurred_at, wait_ends_at)
         VALUES ('pay-cash', 'done', 'SALE', 'CASH', 'NONE', 1000, 1500, NULL, NULL, 'APPROVED', '2026-10-09T12:05:00.000Z', NULL),
                ('pay-transfer', 'open', 'SALE', 'TRANSFER', 'NONE', 400, NULL, 'u1', '2026-10-09T12:08:00.000Z', 'APPROVED', '2026-10-09T12:08:00.000Z', NULL),
                ('pay-qr', 'open', 'SALE', 'QR', 'MERCADOPAGO_QR', 600, NULL, NULL, NULL, 'PENDING', '2026-10-09T12:06:00.000Z', '2026-10-09T12:09:00.000Z');
         UPDATE payment_transactions SET replaced = 1 WHERE id = 'pay-qr';
         INSERT INTO payment_refunds (id, payment_id, method, provider, amount, state, occurred_at)
         VALUES ('refund-1', 'pay-cash', 'CASH', 'NONE', 1000, 'APPROVED', '2026-10-09T12:20:00.000Z');`,
      );
      before.close();

      const after = openLocalDatabase(path, LOCAL_MIGRATIONS, migrationClock);

      expect(
        after
          .prepare(
            `SELECT id, sale_id, method, provider, amount, tendered, authorized_by, confirmed_at, state,
                    occurred_at, wait_ends_at, replaced
             FROM payment_transactions ORDER BY id`,
          )
          .all(),
      ).toEqual([
        {
          id: "pay-cash",
          sale_id: "done",
          method: "CASH",
          provider: "NONE",
          amount: 1000,
          tendered: 1500,
          authorized_by: null,
          confirmed_at: null,
          state: "APPROVED",
          occurred_at: "2026-10-09T12:05:00.000Z",
          wait_ends_at: null,
          replaced: 0,
        },
        {
          id: "pay-qr",
          sale_id: "open",
          method: "QR",
          provider: "MERCADOPAGO_QR",
          amount: 600,
          tendered: null,
          authorized_by: null,
          confirmed_at: null,
          state: "PENDING",
          occurred_at: "2026-10-09T12:06:00.000Z",
          wait_ends_at: "2026-10-09T12:09:00.000Z",
          replaced: 1,
        },
        {
          id: "pay-transfer",
          sale_id: "open",
          method: "TRANSFER",
          provider: "NONE",
          amount: 400,
          tendered: null,
          authorized_by: "u1",
          confirmed_at: "2026-10-09T12:08:00.000Z",
          state: "APPROVED",
          occurred_at: "2026-10-09T12:08:00.000Z",
          wait_ends_at: null,
          replaced: 0,
        },
      ]);
      expect(after.prepare("SELECT id, payment_id FROM payment_refunds").all()).toEqual([
        { id: "refund-1", payment_id: "pay-cash" },
      ]);

      const insertPayment = after.prepare(
        `INSERT INTO payment_transactions (id, sale_id, kind, method, provider, amount, tendered, authorized_by, confirmed_at, state, occurred_at, wait_ends_at)
         VALUES (@id, 'open', 'SALE', 'POINT', @provider, 600, @tendered, @authorized_by, NULL, @state, '2026-10-09T12:10:00.000Z', @wait_ends_at)`,
      );
      const point = {
        provider: "MERCADOPAGO_POINT",
        tendered: null,
        authorized_by: null,
        state: "PENDING",
        wait_ends_at: "2026-10-09T12:13:00.000Z",
      };
      for (const [id, state] of [
        ["point-pending", "PENDING"],
        ["point-approved", "APPROVED"],
        ["point-declined", "DECLINED"],
        ["point-cancelled", "CANCELLED"],
        ["point-expired", "EXPIRED"],
      ]) {
        insertPayment.run({ ...point, id, state });
      }
      expect(
        after
          .prepare("SELECT count(*) AS total FROM payment_transactions WHERE method = 'POINT'")
          .get(),
      ).toEqual({ total: 5 });
      expect(() =>
        insertPayment.run({ ...point, id: "point-on-qr", provider: "MERCADOPAGO_QR" }),
      ).toThrow(/CHECK/);
      expect(() =>
        insertPayment.run({ ...point, id: "point-no-wait", wait_ends_at: null }),
      ).toThrow(/CHECK/);
      expect(() => insertPayment.run({ ...point, id: "point-tendered", tendered: 600 })).toThrow(
        /CHECK/,
      );
      expect(() =>
        insertPayment.run({ ...point, id: "point-authorized", authorized_by: "u1" }),
      ).toThrow(/CHECK/);
      expect(() =>
        after
          .prepare("UPDATE payment_transactions SET replaced = 1 WHERE id = 'point-pending'")
          .run(),
      ).toThrow(/CHECK/);
      expect(() =>
        after
          .prepare(
            "UPDATE payment_transactions SET provider = 'MERCADOPAGO_POINT' WHERE id = 'pay-qr'",
          )
          .run(),
      ).toThrow(/CHECK/);
      expect(
        after
          .prepare("SELECT name FROM sqlite_schema WHERE name = 'payment_transactions_by_sale'")
          .all(),
      ).toEqual([{ name: "payment_transactions_by_sale" }]);
      expect(after.pragma("foreign_key_check")).toEqual([]);
      after.close();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("let a payment be a standalone terminal payment confirmed by hand, keeping the payments and refunds a register already holds", () => {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const path = join(folder, "register.sqlite");
      const previous = LOCAL_MIGRATIONS.filter(
        (migration) => migration.name < "0046_standalone_terminal_payments",
      );
      expect(LOCAL_MIGRATIONS.map((migration) => migration.name)).toContain(
        "0046_standalone_terminal_payments",
      );
      const before = openLocalDatabase(path, previous, migrationClock);
      before.exec(
        `INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
         VALUES ('s1', 'r1', 'device-a', 'u1', '2026-10-09T12:00:00.000Z', 0, 'OPEN');
         INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at)
         VALUES ('done', 'r1', 'device-a', 's1', 'u1', 'COMPLETED', '2026-10-09T12:05:00.000Z'),
                ('open', 'r1', 'device-a', 's1', 'u1', 'OPEN', NULL);
         INSERT INTO payment_transactions (id, sale_id, kind, method, provider, amount, tendered, authorized_by, confirmed_at, state, occurred_at, wait_ends_at)
         VALUES ('pay-cash', 'done', 'SALE', 'CASH', 'NONE', 1000, 1500, NULL, NULL, 'APPROVED', '2026-10-09T12:05:00.000Z', NULL),
                ('pay-transfer', 'open', 'SALE', 'TRANSFER', 'NONE', 400, NULL, 'u1', '2026-10-09T12:08:00.000Z', 'APPROVED', '2026-10-09T12:08:00.000Z', NULL),
                ('pay-point', 'open', 'SALE', 'POINT', 'MERCADOPAGO_POINT', 600, NULL, NULL, NULL, 'PENDING', '2026-10-09T12:06:00.000Z', '2026-10-09T12:09:00.000Z');
         INSERT INTO payment_refunds (id, payment_id, method, provider, amount, state, occurred_at)
         VALUES ('refund-1', 'pay-cash', 'CASH', 'NONE', 1000, 'APPROVED', '2026-10-09T12:20:00.000Z');`,
      );
      before.close();

      const after = openLocalDatabase(path, LOCAL_MIGRATIONS, migrationClock);

      expect(
        after
          .prepare("SELECT id, method, provider, state FROM payment_transactions ORDER BY id")
          .all(),
      ).toEqual([
        { id: "pay-cash", method: "CASH", provider: "NONE", state: "APPROVED" },
        { id: "pay-point", method: "POINT", provider: "MERCADOPAGO_POINT", state: "PENDING" },
        { id: "pay-transfer", method: "TRANSFER", provider: "NONE", state: "APPROVED" },
      ]);
      expect(after.prepare("SELECT id, payment_id FROM payment_refunds").all()).toEqual([
        { id: "refund-1", payment_id: "pay-cash" },
      ]);

      const insertPayment = after.prepare(
        `INSERT INTO payment_transactions (id, sale_id, kind, method, provider, amount, tendered, authorized_by, confirmed_at, state, occurred_at, wait_ends_at)
         VALUES (@id, 'open', 'SALE', 'STANDALONE_TERMINAL', @provider, 600, @tendered, @authorized_by, @confirmed_at, @state, '2026-10-09T12:10:00.000Z', @wait_ends_at)`,
      );
      const standalone = {
        provider: "EXTERNAL_TERMINAL",
        tendered: null,
        authorized_by: "u1",
        confirmed_at: "2026-10-09T12:10:00.000Z",
        state: "APPROVED",
        wait_ends_at: null,
      };
      insertPayment.run({ ...standalone, id: "standalone-1" });
      expect(
        after
          .prepare(
            "SELECT authorized_by, confirmed_at FROM payment_transactions WHERE id = 'standalone-1'",
          )
          .get(),
      ).toEqual({ authorized_by: "u1", confirmed_at: "2026-10-09T12:10:00.000Z" });
      expect(() =>
        insertPayment.run({ ...standalone, id: "no-authorizer", authorized_by: null }),
      ).toThrow(/CHECK/);
      expect(() =>
        insertPayment.run({ ...standalone, id: "no-confirmation", confirmed_at: null }),
      ).toThrow(/CHECK/);
      expect(() => insertPayment.run({ ...standalone, id: "tendered", tendered: 600 })).toThrow(
        /CHECK/,
      );
      expect(() => insertPayment.run({ ...standalone, id: "pending", state: "PENDING" })).toThrow(
        /CHECK/,
      );
      expect(() =>
        insertPayment.run({
          ...standalone,
          id: "waiting",
          wait_ends_at: "2026-10-09T12:13:00.000Z",
        }),
      ).toThrow(/CHECK/);
      expect(() =>
        insertPayment.run({ ...standalone, id: "no-terminal", provider: "NONE" }),
      ).toThrow(/CHECK/);
      expect(() =>
        insertPayment.run({ ...standalone, id: "mercado-pago", provider: "MERCADOPAGO_POINT" }),
      ).toThrow(/CHECK/);
      expect(() =>
        after
          .prepare(
            "UPDATE payment_transactions SET provider = 'EXTERNAL_TERMINAL' WHERE id = 'pay-transfer'",
          )
          .run(),
      ).toThrow(/CHECK/);
      expect(
        after
          .prepare("SELECT name FROM sqlite_schema WHERE name = 'payment_transactions_by_sale'")
          .all(),
      ).toEqual([{ name: "payment_transactions_by_sale" }]);
      expect(after.pragma("foreign_key_check")).toEqual([]);
      after.close();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("let a refund be pending on the standalone terminal, keeping the refunds a register already holds", () => {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const path = join(folder, "register.sqlite");
      const previous = LOCAL_MIGRATIONS.filter(
        (migration) => migration.name < "0048_standalone_terminal_refunds",
      );
      expect(LOCAL_MIGRATIONS.map((migration) => migration.name)).toContain(
        "0048_standalone_terminal_refunds",
      );
      const before = openLocalDatabase(path, previous, migrationClock);
      before.exec(
        `INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
         VALUES ('s1', 'r1', 'device-a', 'u1', '2026-10-09T12:00:00.000Z', 0, 'OPEN');
         INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at)
         VALUES ('done', 'r1', 'device-a', 's1', 'u1', 'CANCELLED', '2026-10-09T12:05:00.000Z');
         INSERT INTO payment_transactions (id, sale_id, kind, method, provider, amount, tendered, authorized_by, confirmed_at, state, occurred_at, wait_ends_at)
         VALUES ('pay-cash', 'done', 'SALE', 'CASH', 'NONE', 1000, 1500, NULL, NULL, 'APPROVED', '2026-10-09T12:05:00.000Z', NULL),
                ('pay-transfer', 'done', 'SALE', 'TRANSFER', 'NONE', 400, NULL, 'u1', '2026-10-09T12:08:00.000Z', 'APPROVED', '2026-10-09T12:08:00.000Z', NULL),
                ('pay-standalone', 'done', 'SALE', 'STANDALONE_TERMINAL', 'EXTERNAL_TERMINAL', 600, NULL, 'u1', '2026-10-09T12:09:00.000Z', 'APPROVED', '2026-10-09T12:09:00.000Z', NULL);
         INSERT INTO payment_refunds (id, payment_id, method, provider, amount, state, occurred_at)
         VALUES ('refund-cash', 'pay-cash', 'CASH', 'NONE', 1000, 'APPROVED', '2026-10-09T12:20:00.000Z'),
                ('refund-transfer', 'pay-transfer', 'TRANSFER', 'NONE', 400, 'PENDING', '2026-10-09T12:20:00.000Z');`,
      );
      before.close();

      const after = openLocalDatabase(path, LOCAL_MIGRATIONS, migrationClock);

      expect(
        after
          .prepare(
            "SELECT id, payment_id, method, provider, state FROM payment_refunds ORDER BY id",
          )
          .all(),
      ).toEqual([
        {
          id: "refund-cash",
          payment_id: "pay-cash",
          method: "CASH",
          provider: "NONE",
          state: "APPROVED",
        },
        {
          id: "refund-transfer",
          payment_id: "pay-transfer",
          method: "TRANSFER",
          provider: "NONE",
          state: "PENDING",
        },
      ]);
      const insertRefund = after.prepare(
        `INSERT INTO payment_refunds (id, payment_id, method, provider, amount, state, occurred_at)
         VALUES (@id, 'pay-standalone', @method, @provider, 600, @state, '2026-10-09T12:30:00.000Z')`,
      );
      const standalone = {
        method: "STANDALONE_TERMINAL",
        provider: "EXTERNAL_TERMINAL",
        state: "PENDING",
      };
      insertRefund.run({ ...standalone, id: "refund-standalone" });
      expect(
        after
          .prepare(
            "SELECT method, provider, state FROM payment_refunds WHERE id = 'refund-standalone'",
          )
          .get(),
      ).toEqual(standalone);
      expect(() =>
        insertRefund.run({ ...standalone, id: "already-done", state: "APPROVED" }),
      ).toThrow(/CHECK/);
      expect(() =>
        insertRefund.run({ ...standalone, id: "no-terminal", provider: "NONE" }),
      ).toThrow(/CHECK/);
      expect(() =>
        insertRefund.run({ ...standalone, id: "transfer-on-terminal", method: "TRANSFER" }),
      ).toThrow(/CHECK/);
      expect(() =>
        insertRefund.run({ ...standalone, id: "cash-on-terminal", method: "CASH" }),
      ).toThrow(/CHECK/);
      expect(() =>
        insertRefund.run({ ...standalone, id: "mercado-pago", provider: "MERCADOPAGO_POINT" }),
      ).toThrow(/CHECK/);
      expect(
        after
          .prepare("SELECT name FROM sqlite_schema WHERE name = 'payment_refunds_by_payment'")
          .all(),
      ).toEqual([{ name: "payment_refunds_by_payment" }]);
      expect(after.pragma("foreign_key_check")).toEqual([]);
      after.close();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("add the documents issued under a pre-obtained code, keeping the sales and fiscal documents a register already holds", () => {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const path = join(folder, "register.sqlite");
      const previous = LOCAL_MIGRATIONS.filter(
        (migration) => migration.name < "0050_offline_fiscal_documents",
      );
      expect(LOCAL_MIGRATIONS.map((migration) => migration.name)).toContain(
        "0050_offline_fiscal_documents",
      );
      const before = openLocalDatabase(path, previous, migrationClock);
      before.exec(
        `INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
         VALUES ('s1', 'r1', 'device-a', 'u1', '2026-10-09T12:00:00.000Z', 0, 'OPEN');
         INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at)
         VALUES ('done', 'r1', 'device-a', 's1', 'u1', 'COMPLETED', '2026-10-09T12:05:00.000Z'),
                ('later', 'r1', 'device-a', 's1', 'u1', 'COMPLETED', '2026-10-09T12:06:00.000Z'),
                ('third', 'r1', 'device-a', 's1', 'u1', 'COMPLETED', '2026-10-09T12:07:00.000Z');
         INSERT INTO fiscal_documents (id, sale_id, point_of_sale, document_type, number, issued_on, document, state, reserved_at, resolved_at)
         VALUES ('doc-1', 'done', 12, 'factura_c', 41, '2026-10-09', '{}', 'REJECTED', '2026-10-09T12:05:00.000Z', '2026-10-09T12:05:01.000Z');`,
      );
      before.close();

      const after = openLocalDatabase(path, LOCAL_MIGRATIONS, migrationClock);

      expect(after.prepare("SELECT id, state FROM fiscal_documents").all()).toEqual([
        { id: "doc-1", state: "REJECTED" },
      ]);
      expect(after.prepare("SELECT count(*) AS total FROM offline_fiscal_documents").get()).toEqual(
        {
          total: 0,
        },
      );
      const insert = after.prepare(
        `INSERT INTO offline_fiscal_documents (
           id, sale_id, point_of_sale, document_type, number, issued_on, generated_at, generation_stamp,
           offline_authorization_code, fortnight_start, fortnight_end, document,
           buyer_document_type, buyer_document_number, cause
         ) VALUES (
           @id, @sale_id, 31, @document_type, @number, '2026-10-09', '2026-10-09T12:05:00.000Z', '20261009090500',
           '36251478963214', '2026-10-01', '2026-10-15', '{}', 99, 0, @cause
         )`,
      );
      const issued = {
        id: "offline-1",
        sale_id: "done",
        document_type: "factura_c",
        number: 1,
        cause: "no_connectivity",
      };
      insert.run(issued);
      expect(() => insert.run({ ...issued, id: "offline-2", number: 2 })).toThrow(/UNIQUE/);
      expect(() => insert.run({ ...issued, id: "offline-3", sale_id: "later" })).toThrow(/UNIQUE/);
      expect(() =>
        insert.run({ ...issued, id: "offline-4", sale_id: "later", document_type: "factura_a" }),
      ).toThrow(/CHECK/);
      expect(() =>
        insert.run({ ...issued, id: "offline-5", sale_id: "later", number: 2, cause: "other" }),
      ).toThrow(/CHECK/);
      expect(() =>
        insert.run({ ...issued, id: "offline-6", sale_id: "missing", number: 3 }),
      ).toThrow(/FOREIGN KEY/);
      for (const cause of ["unclear_outcome", "numbering_conflict"]) {
        insert.run({
          ...issued,
          id: `offline-${cause}`,
          sale_id: cause === "unclear_outcome" ? "later" : "third",
          number: cause === "unclear_outcome" ? 2 : 3,
          cause,
        });
      }
      expect(after.pragma("foreign_key_check")).toEqual([]);
      after.close();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("let a refund be pending on Mercado Pago QR, keeping the refunds a register already holds", () => {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const path = join(folder, "register.sqlite");
      const previous = LOCAL_MIGRATIONS.filter((migration) => migration.name < "0049_qr_refunds");
      expect(LOCAL_MIGRATIONS.map((migration) => migration.name)).toContain("0049_qr_refunds");
      const before = openLocalDatabase(path, previous, migrationClock);
      before.exec(
        `INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
         VALUES ('s1', 'r1', 'device-a', 'u1', '2026-10-09T12:00:00.000Z', 0, 'OPEN');
         INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at)
         VALUES ('done', 'r1', 'device-a', 's1', 'u1', 'CANCELLED', '2026-10-09T12:05:00.000Z');
         INSERT INTO payment_transactions (id, sale_id, kind, method, provider, amount, tendered, authorized_by, confirmed_at, state, occurred_at, wait_ends_at)
         VALUES ('pay-cash', 'done', 'SALE', 'CASH', 'NONE', 1000, 1500, NULL, NULL, 'APPROVED', '2026-10-09T12:05:00.000Z', NULL),
                ('pay-standalone', 'done', 'SALE', 'STANDALONE_TERMINAL', 'EXTERNAL_TERMINAL', 600, NULL, 'u1', '2026-10-09T12:09:00.000Z', 'APPROVED', '2026-10-09T12:09:00.000Z', NULL),
                ('pay-qr', 'done', 'SALE', 'QR', 'MERCADOPAGO_QR', 700, NULL, NULL, NULL, 'APPROVED', '2026-10-09T12:10:00.000Z', '2026-10-09T12:13:00.000Z');
         INSERT INTO payment_refunds (id, payment_id, method, provider, amount, state, occurred_at)
         VALUES ('refund-cash', 'pay-cash', 'CASH', 'NONE', 1000, 'APPROVED', '2026-10-09T12:20:00.000Z'),
                ('refund-standalone', 'pay-standalone', 'STANDALONE_TERMINAL', 'EXTERNAL_TERMINAL', 600, 'PENDING', '2026-10-09T12:20:00.000Z');`,
      );
      before.close();

      const after = openLocalDatabase(path, LOCAL_MIGRATIONS, migrationClock);

      expect(
        after
          .prepare(
            "SELECT id, payment_id, method, provider, state FROM payment_refunds ORDER BY id",
          )
          .all(),
      ).toEqual([
        {
          id: "refund-cash",
          payment_id: "pay-cash",
          method: "CASH",
          provider: "NONE",
          state: "APPROVED",
        },
        {
          id: "refund-standalone",
          payment_id: "pay-standalone",
          method: "STANDALONE_TERMINAL",
          provider: "EXTERNAL_TERMINAL",
          state: "PENDING",
        },
      ]);
      const insertRefund = after.prepare(
        `INSERT INTO payment_refunds (id, payment_id, method, provider, amount, state, occurred_at)
         VALUES (@id, 'pay-qr', @method, @provider, 700, @state, '2026-10-09T12:30:00.000Z')`,
      );
      const qr = { method: "QR", provider: "MERCADOPAGO_QR", state: "PENDING" };
      insertRefund.run({ ...qr, id: "refund-qr" });
      expect(
        after
          .prepare("SELECT method, provider, state FROM payment_refunds WHERE id = 'refund-qr'")
          .get(),
      ).toEqual(qr);
      expect(() => insertRefund.run({ ...qr, id: "already-done", state: "APPROVED" })).toThrow(
        /CHECK/,
      );
      expect(() => insertRefund.run({ ...qr, id: "no-provider", provider: "NONE" })).toThrow(
        /CHECK/,
      );
      expect(() =>
        insertRefund.run({ ...qr, id: "point-provider", provider: "MERCADOPAGO_POINT" }),
      ).toThrow(/CHECK/);
      expect(() => insertRefund.run({ ...qr, id: "cash-on-qr", method: "CASH" })).toThrow(/CHECK/);
      expect(() => insertRefund.run({ ...qr, id: "transfer-on-qr", method: "TRANSFER" })).toThrow(
        /CHECK/,
      );
      expect(
        after
          .prepare("SELECT name FROM sqlite_schema WHERE name = 'payment_refunds_by_payment'")
          .all(),
      ).toEqual([{ name: "payment_refunds_by_payment" }]);
      expect(after.pragma("foreign_key_check")).toEqual([]);
      after.close();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("let a refund be pending on Mercado Pago Point, keeping the refunds a register already holds", () => {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const path = join(folder, "register.sqlite");
      const previous = LOCAL_MIGRATIONS.filter(
        (migration) => migration.name < "0059_point_refunds",
      );
      expect(LOCAL_MIGRATIONS.map((migration) => migration.name)).toContain("0059_point_refunds");
      const before = openLocalDatabase(path, previous, migrationClock);
      before.exec(
        `INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
         VALUES ('s1', 'r1', 'device-a', 'u1', '2026-10-09T12:00:00.000Z', 0, 'OPEN');
         INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at)
         VALUES ('done', 'r1', 'device-a', 's1', 'u1', 'COMPLETED', '2026-10-09T12:05:00.000Z');
         INSERT INTO payment_transactions (id, sale_id, kind, method, provider, amount, tendered, authorized_by, confirmed_at, state, occurred_at, wait_ends_at)
         VALUES ('pay-cash', 'done', 'SALE', 'CASH', 'NONE', 1000, 1500, NULL, NULL, 'APPROVED', '2026-10-09T12:05:00.000Z', NULL),
                ('pay-qr', 'done', 'SALE', 'QR', 'MERCADOPAGO_QR', 700, NULL, NULL, NULL, 'APPROVED', '2026-10-09T12:10:00.000Z', '2026-10-09T12:13:00.000Z'),
                ('pay-point', 'done', 'SALE', 'POINT', 'MERCADOPAGO_POINT', 800, NULL, NULL, NULL, 'APPROVED', '2026-10-09T12:11:00.000Z', '2026-10-09T12:14:00.000Z');
         INSERT INTO payment_refunds (id, payment_id, method, provider, amount, state, occurred_at)
         VALUES ('refund-cash', 'pay-cash', 'CASH', 'NONE', 1000, 'APPROVED', '2026-10-09T12:20:00.000Z'),
                ('refund-qr', 'pay-qr', 'QR', 'MERCADOPAGO_QR', 700, 'PENDING', '2026-10-09T12:20:00.000Z');`,
      );
      before.close();

      const after = openLocalDatabase(path, LOCAL_MIGRATIONS, migrationClock);

      expect(
        after
          .prepare(
            "SELECT id, payment_id, method, provider, state FROM payment_refunds ORDER BY id",
          )
          .all(),
      ).toEqual([
        {
          id: "refund-cash",
          payment_id: "pay-cash",
          method: "CASH",
          provider: "NONE",
          state: "APPROVED",
        },
        {
          id: "refund-qr",
          payment_id: "pay-qr",
          method: "QR",
          provider: "MERCADOPAGO_QR",
          state: "PENDING",
        },
      ]);
      const insertRefund = after.prepare(
        `INSERT INTO payment_refunds (id, payment_id, method, provider, amount, state, occurred_at)
         VALUES (@id, 'pay-point', @method, @provider, 800, @state, '2026-10-09T12:30:00.000Z')`,
      );
      const point = { method: "POINT", provider: "MERCADOPAGO_POINT", state: "PENDING" };
      insertRefund.run({ ...point, id: "refund-point" });
      expect(
        after
          .prepare("SELECT method, provider, state FROM payment_refunds WHERE id = 'refund-point'")
          .get(),
      ).toEqual(point);
      expect(() => insertRefund.run({ ...point, id: "already-done", state: "APPROVED" })).toThrow(
        /CHECK/,
      );
      expect(() => insertRefund.run({ ...point, id: "no-provider", provider: "NONE" })).toThrow(
        /CHECK/,
      );
      expect(() =>
        insertRefund.run({ ...point, id: "qr-provider", provider: "MERCADOPAGO_QR" }),
      ).toThrow(/CHECK/);
      expect(() =>
        insertRefund.run({
          ...point,
          id: "qr-on-point",
          method: "QR",
          provider: "MERCADOPAGO_POINT",
        }),
      ).toThrow(/CHECK/);
      expect(() => insertRefund.run({ ...point, id: "cash-on-point", method: "CASH" })).toThrow(
        /CHECK/,
      );
      expect(
        after
          .prepare("SELECT name FROM sqlite_schema WHERE name = 'payment_refunds_by_payment'")
          .all(),
      ).toEqual([{ name: "payment_refunds_by_payment" }]);
      expect(after.pragma("foreign_key_check")).toEqual([]);
      after.close();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("add the tax authority's last authorized number to the offline point of sale, unknown over the one a register already holds", () => {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const path = join(folder, "register.sqlite");
      const previous = LOCAL_MIGRATIONS.filter(
        (migration) => migration.name < "0037_offline_point_of_sale_tax_authority_count",
      );
      expect(LOCAL_MIGRATIONS.map((migration) => migration.name)).toContain(
        "0037_offline_point_of_sale_tax_authority_count",
      );
      const before = openLocalDatabase(path, previous, migrationClock);
      before
        .prepare(
          `INSERT INTO register_offline_point_of_sale (register_id, point_of_sale_number, version)
           VALUES ('r1', 31, 2)`,
        )
        .run();
      before.close();

      const after = openLocalDatabase(path, LOCAL_MIGRATIONS, migrationClock);

      expect(
        after
          .prepare(
            "SELECT register_id, point_of_sale_number, version FROM register_offline_point_of_sale",
          )
          .all(),
      ).toEqual([{ register_id: "r1", point_of_sale_number: 31, version: 2 }]);
      expect(after.prepare("SELECT * FROM offline_series_counts").all()).toEqual([]);
      const setCount = (count: number | null) =>
        after
          .prepare(
            `INSERT OR REPLACE INTO offline_series_counts (point_of_sale, document_type, tax_authority_last_authorized_number)
             VALUES (31, 'factura_c', ?)`,
          )
          .run(count);
      expect(() => setCount(0)).not.toThrow();
      expect(() => setCount(null)).not.toThrow();
      expect(() => setCount(-1)).toThrow(/CHECK/);
      after.close();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("declare the point of sale for redelivery over the one received before it held the tax authority's count, leaving the pull cursor as it is", () => {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const path = join(folder, "register.sqlite");
      const previous = LOCAL_MIGRATIONS.filter(
        (migration) => migration.name < "0021_real_time_authorization",
      );
      const before = openLocalDatabase(path, previous, migrationClock);
      before.exec(
        `UPDATE sync_state SET pull_cursor = 9, device_id = 'device-a' WHERE id = 1;
         INSERT INTO own_register (id, name, version, removed) VALUES ('r1', 'Caja 1', 1, 0);
         INSERT INTO register_point_of_sale (register_id, point_of_sale_number, fiscal_address_id, version)
         VALUES ('r1', 12, 'address-1', 2);`,
      );
      before.close();

      const after = openLocalDatabase(path, LOCAL_MIGRATIONS, migrationClock);

      expect(
        after
          .prepare("SELECT table_name, cursor FROM pulled_table_redeliveries ORDER BY table_name")
          .all(),
      ).toContainEqual({ table_name: "register_point_of_sale", cursor: 0 });
      expect(after.prepare("SELECT pull_cursor FROM sync_state").all()).toEqual([
        { pull_cursor: 9 },
      ]);
      after.close();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("declare the offline point of sale for redelivery over the one received before it held the tax authority's count, leaving the pull cursor as it is", () => {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const path = join(folder, "register.sqlite");
      const previous = LOCAL_MIGRATIONS.filter(
        (migration) => migration.name < "0037_offline_point_of_sale_tax_authority_count",
      );
      const before = openLocalDatabase(path, previous, migrationClock);
      before.exec(
        `UPDATE sync_state SET pull_cursor = 9, device_id = 'device-a' WHERE id = 1;
         INSERT INTO register_offline_point_of_sale (register_id, point_of_sale_number, version)
         VALUES ('r1', 31, 2);`,
      );
      before.close();

      const after = openLocalDatabase(path, LOCAL_MIGRATIONS, migrationClock);

      expect(
        after
          .prepare("SELECT table_name, cursor FROM pulled_table_redeliveries ORDER BY table_name")
          .all(),
      ).toEqual([
        { table_name: "branch_first_cash_sessions", cursor: 0 },
        { table_name: "register_offline_point_of_sale", cursor: 0 },
        { table_name: "register_point_of_sale", cursor: 0 },
        { table_name: "stock_movements", cursor: 0 },
      ]);
      expect(after.prepare("SELECT pull_cursor FROM sync_state").all()).toEqual([
        { pull_cursor: 9 },
      ]);
      after.close();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("declare the offline point of sale for redelivery from its first change over the one received before it held the highest synced offline number, leaving the pull cursor as it is", () => {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const path = join(folder, "register.sqlite");
      const previous = LOCAL_MIGRATIONS.filter(
        (migration) => migration.name < "0055_offline_numbering_floor",
      );
      const before = openLocalDatabase(path, previous, migrationClock);
      before.exec(
        `UPDATE sync_state SET pull_cursor = 9, device_id = 'device-a' WHERE id = 1;
         INSERT INTO register_offline_point_of_sale (register_id, point_of_sale_number, version)
         VALUES ('r1', 31, 2);
         UPDATE pulled_table_redeliveries SET cursor = 7
         WHERE table_name = 'register_offline_point_of_sale';`,
      );
      before.close();

      const after = openLocalDatabase(path, LOCAL_MIGRATIONS, migrationClock);

      expect(
        after
          .prepare("SELECT table_name, cursor FROM pulled_table_redeliveries ORDER BY table_name")
          .all(),
      ).toContainEqual({ table_name: "register_offline_point_of_sale", cursor: 0 });
      expect(after.prepare("SELECT pull_cursor FROM sync_state").all()).toEqual([
        { pull_cursor: 9 },
      ]);
      after.close();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("declare the point of sale for redelivery from its first change over the one received before it held whether its numbering is frozen, leaving the pull cursor as it is", () => {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const path = join(folder, "register.sqlite");
      const previous = LOCAL_MIGRATIONS.filter(
        (migration) => migration.name < "0056_numbering_freeze",
      );
      const before = openLocalDatabase(path, previous, migrationClock);
      before.exec(
        `UPDATE sync_state SET pull_cursor = 9, device_id = 'device-a' WHERE id = 1;
         INSERT INTO own_register (id, name, version, removed) VALUES ('r1', 'Caja 1', 1, 0);
         INSERT INTO register_point_of_sale (register_id, point_of_sale_number, fiscal_address_id, version)
         VALUES ('r1', 12, 'address-1', 2);
         UPDATE pulled_table_redeliveries SET cursor = 7
         WHERE table_name = 'register_point_of_sale';`,
      );
      before.close();

      const after = openLocalDatabase(path, LOCAL_MIGRATIONS, migrationClock);

      expect(
        after
          .prepare("SELECT table_name, cursor FROM pulled_table_redeliveries ORDER BY table_name")
          .all(),
      ).toContainEqual({ table_name: "register_point_of_sale", cursor: 0 });
      expect(after.prepare("SELECT pull_cursor FROM sync_state").all()).toEqual([
        { pull_cursor: 9 },
      ]);
      after.close();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("refuse a redelivery cursor below zero", () => {
    const database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);

    expect(() =>
      database
        .prepare("INSERT INTO pulled_table_redeliveries (table_name, cursor) VALUES ('users', -1)")
        .run(),
    ).toThrow(/CHECK/);
    database.close();
  });

  it("let a sale line carry a manual adjustment of its price or a manual discount, none over the lines it already holds", () => {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const path = join(folder, "register.sqlite");
      const previous = LOCAL_MIGRATIONS.filter(
        (migration) => migration.name < "0039_manual_line_adjustments",
      );
      expect(LOCAL_MIGRATIONS.map((migration) => migration.name)).toContain(
        "0039_manual_line_adjustments",
      );
      const before = openLocalDatabase(path, previous, migrationClock);
      before.exec(
        `INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
         VALUES ('s1', 'r1', 'device-a', 'u1', '2026-10-09T12:00:00.000Z', 0, 'OPEN');
         INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at)
         VALUES ('sale-1', 'r1', 'device-a', 's1', 'u1', 'OPEN', NULL);
         INSERT INTO sale_lines (id, sale_id, position, product_id, product_name, quantity, list_unit_price, price_list_id, line_total)
         VALUES ('line-1', 'sale-1', 1, 'p1', 'Yerba', 2, 1500, 'list-1', 3000);`,
      );
      before.close();

      const after = openLocalDatabase(path, LOCAL_MIGRATIONS, migrationClock);

      expect(
        after
          .prepare(
            `SELECT id, line_total, manual_adjustment_kind, manual_adjustment_value,
                    manual_adjustment_reason, manual_adjustment_authorized_by
             FROM sale_lines`,
          )
          .all(),
      ).toEqual([
        {
          id: "line-1",
          line_total: 3000,
          manual_adjustment_kind: null,
          manual_adjustment_value: null,
          manual_adjustment_reason: null,
          manual_adjustment_authorized_by: null,
        },
      ]);
      const adjust = (values: {
        kind: string | null;
        value: number | null;
        reason: string | null;
        authorized_by: string | null;
      }) =>
        after
          .prepare(
            `UPDATE sale_lines
             SET manual_adjustment_kind = @kind, manual_adjustment_value = @value,
                 manual_adjustment_reason = @reason, manual_adjustment_authorized_by = @authorized_by`,
          )
          .run(values);
      const set = { reason: "Producto golpeado", authorized_by: null };
      expect(() => adjust({ kind: "PRICE", value: 0, ...set })).not.toThrow();
      expect(() => adjust({ kind: "PRICE", value: 1200, ...set })).not.toThrow();
      expect(() => adjust({ kind: "PERCENT", value: 1, ...set })).not.toThrow();
      expect(() => adjust({ kind: "PERCENT", value: 100, ...set })).not.toThrow();
      expect(() => adjust({ kind: "AMOUNT", value: 1, ...set })).not.toThrow();
      expect(() =>
        adjust({ kind: "AMOUNT", value: 300, ...set, authorized_by: "u2" }),
      ).not.toThrow();
      expect(() =>
        adjust({ kind: null, value: null, reason: null, authorized_by: null }),
      ).not.toThrow();
      expect(() => adjust({ kind: "FREE", value: 1, ...set })).toThrow(/CHECK/);
      expect(() => adjust({ kind: "PRICE", value: -1, ...set })).toThrow(/CHECK/);
      expect(() => adjust({ kind: "PERCENT", value: 0, ...set })).toThrow(/CHECK/);
      expect(() => adjust({ kind: "PERCENT", value: 101, ...set })).toThrow(/CHECK/);
      expect(() => adjust({ kind: "AMOUNT", value: 0, ...set })).toThrow(/CHECK/);
      expect(() => adjust({ kind: "PRICE", value: null, ...set })).toThrow(/CHECK/);
      expect(() => adjust({ kind: null, value: 100, reason: null, authorized_by: null })).toThrow(
        /CHECK/,
      );
      expect(() =>
        adjust({ kind: "PRICE", value: 100, reason: null, authorized_by: null }),
      ).toThrow(/CHECK/);
      expect(() =>
        adjust({ kind: "PRICE", value: 100, reason: "  ", authorized_by: null }),
      ).toThrow(/CHECK/);
      expect(() =>
        adjust({ kind: null, value: null, reason: "Motivo", authorized_by: null }),
      ).toThrow(/CHECK/);
      expect(() => adjust({ kind: null, value: null, reason: null, authorized_by: "u2" })).toThrow(
        /CHECK/,
      );
      after.close();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("let an unclear fiscal document be released or conflicting and a deferred sale be satisfied only by an authorized document of its own sale, over the documents a register already holds", () => {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const path = join(folder, "register.sqlite");
      const previous = LOCAL_MIGRATIONS.filter(
        (migration) => migration.name < "0040_unclear_outcome_settlements",
      );
      expect(LOCAL_MIGRATIONS.map((migration) => migration.name)).toContain(
        "0040_unclear_outcome_settlements",
      );
      const before = openLocalDatabase(path, previous, migrationClock);
      before.exec(
        `INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
         VALUES ('s1', 'r1', 'device-a', 'u1', '2026-10-09T12:00:00.000Z', 0, 'OPEN');
         INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at)
         VALUES ('sale-1', 'r1', 'device-a', 's1', 'u1', 'COMPLETED', '2026-10-09T12:05:00.000Z'),
                ('sale-2', 'r1', 'device-a', 's1', 'u1', 'COMPLETED', '2026-10-09T12:06:00.000Z');
         INSERT INTO fiscal_documents (
           id, sale_id, point_of_sale, document_type, number, issued_on, document, state,
           authorization_code, authorization_code_due_on, reserved_at, resolved_at
         ) VALUES
           ('doc-1', 'sale-1', 12, 'factura_c', 41, '2026-10-09', '{"total":1500}', 'AUTHORIZED',
            '75123456789012', '2026-10-19', '2026-10-09T12:05:00.000Z', '2026-10-09T12:05:01.000Z'),
           ('doc-2', 'sale-2', 12, 'factura_c', 42, '2026-10-09', '{"total":2500}', 'UNKNOWN',
            NULL, NULL, '2026-10-09T12:06:00.000Z', '2026-10-09T12:06:06.000Z');
         INSERT INTO deferred_sales (sale_id, reason, routed_at)
         VALUES ('sale-2', 'unclear_outcome', '2026-10-09T12:06:06.000Z');`,
      );
      before.close();

      const after = openLocalDatabase(
        path,
        LOCAL_MIGRATIONS.filter(
          (migration) => migration.name <= "0040_unclear_outcome_settlements",
        ),
        migrationClock,
      );

      expect(
        after.prepare("SELECT id, number, state FROM fiscal_documents ORDER BY id").all(),
      ).toEqual([
        { id: "doc-1", number: 41, state: "AUTHORIZED" },
        { id: "doc-2", number: 42, state: "UNKNOWN" },
      ]);
      expect(after.prepare("SELECT * FROM deferred_sales").all()).toEqual([
        {
          sale_id: "sale-2",
          reason: "unclear_outcome",
          routed_at: "2026-10-09T12:06:06.000Z",
          satisfied_by_fiscal_document_id: null,
          satisfied_at: null,
        },
      ]);
      expect(after.pragma("foreign_key_check")).toEqual([]);

      const settle = (state: string) =>
        after.prepare("UPDATE fiscal_documents SET state = ? WHERE id = 'doc-2'").run(state);
      expect(() => settle("RELEASED")).not.toThrow();
      expect(() => settle("CONFLICTING")).not.toThrow();
      expect(() => settle("PENDING")).toThrow(/CHECK/);
      expect(() =>
        after
          .prepare(
            "UPDATE fiscal_documents SET authorization_code = 'x', authorization_code_due_on = '2026-10-19' WHERE id = 'doc-2'",
          )
          .run(),
      ).toThrow(/CHECK/);

      const satisfy = (documentId: string | null, at: string | null) =>
        after
          .prepare(
            "UPDATE deferred_sales SET satisfied_by_fiscal_document_id = ?, satisfied_at = ? WHERE sale_id = 'sale-2'",
          )
          .run(documentId, at);
      const notOwnAuthorization = /an authorized fiscal document of its own sale/;
      expect(() => satisfy("missing", "2026-10-09T12:07:00.000Z")).toThrow(notOwnAuthorization);
      expect(() => satisfy("doc-1", "2026-10-09T12:07:00.000Z")).toThrow(notOwnAuthorization);
      expect(() => satisfy("doc-2", "2026-10-09T12:07:00.000Z")).toThrow(notOwnAuthorization);
      expect(() =>
        after
          .prepare(
            `INSERT INTO deferred_sales (
               sale_id, reason, routed_at, satisfied_by_fiscal_document_id, satisfied_at
             ) VALUES ('sale-1', 'rejected', '2026-10-09T12:05:01.000Z', 'doc-2', '2026-10-09T12:07:00.000Z')`,
          )
          .run(),
      ).toThrow(notOwnAuthorization);
      after
        .prepare(
          `UPDATE fiscal_documents
           SET state = 'AUTHORIZED', authorization_code = '75123456789012',
               authorization_code_due_on = '2026-10-19'
           WHERE id = 'doc-2'`,
        )
        .run();
      expect(() => satisfy("doc-2", null)).toThrow(/CHECK/);
      expect(() => satisfy(null, "2026-10-09T12:07:00.000Z")).toThrow(/CHECK/);
      expect(() => satisfy("doc-2", "2026-10-09T12:07:00.000Z")).not.toThrow();
      after.close();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("free the number of a released document and keep the number of a conflicting one in use", () => {
    const database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
    database.exec(
      `INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
       VALUES ('s1', 'r1', 'device-a', 'u1', '2026-10-09T12:00:00.000Z', 0, 'OPEN');
       INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at)
       VALUES ('sale-1', 'r1', 'device-a', 's1', 'u1', 'COMPLETED', '2026-10-09T12:05:00.000Z'),
              ('sale-2', 'r1', 'device-a', 's1', 'u1', 'COMPLETED', '2026-10-09T12:06:00.000Z'),
              ('sale-3', 'r1', 'device-a', 's1', 'u1', 'COMPLETED', '2026-10-09T12:07:00.000Z');`,
    );
    const insert = (id: string, saleId: string, number: number, state: string) =>
      database
        .prepare(
          `INSERT INTO fiscal_documents (
             id, sale_id, point_of_sale, document_type, number, issued_on, document, state,
             reserved_at, resolved_at
           ) VALUES (?, ?, 12, 'factura_c', ?, '2026-10-09', '{}', ?, '2026-10-09T12:05:00.000Z', ?)`,
        )
        .run(id, saleId, number, state, state === "REQUESTING" ? null : "2026-10-09T12:05:01.000Z");

    insert("doc-1", "sale-1", 41, "RELEASED");
    expect(() => insert("doc-2", "sale-2", 41, "REQUESTING")).not.toThrow();
    database
      .prepare(
        "UPDATE fiscal_documents SET state = 'CONFLICTING', resolved_at = '2026-10-09T12:05:02.000Z' WHERE id = 'doc-2'",
      )
      .run();
    expect(() => insert("doc-3", "sale-3", 41, "REQUESTING")).toThrow(/UNIQUE/);
    expect(() => insert("doc-3", "sale-3", 42, "REQUESTING")).not.toThrow();
    database.close();
  });

  it("let a sale carry a discount on its total, none over the sales it already holds", () => {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const path = join(folder, "register.sqlite");
      const previous = LOCAL_MIGRATIONS.filter(
        (migration) => migration.name < "0041_sale_total_discounts",
      );
      expect(LOCAL_MIGRATIONS.map((migration) => migration.name)).toContain(
        "0041_sale_total_discounts",
      );
      const before = openLocalDatabase(path, previous, migrationClock);
      before.exec(
        `INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
         VALUES ('s1', 'r1', 'device-a', 'u1', '2026-10-09T12:00:00.000Z', 0, 'OPEN');
         INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at)
         VALUES ('sale-1', 'r1', 'device-a', 's1', 'u1', 'OPEN', NULL);`,
      );
      before.close();

      const after = openLocalDatabase(path, LOCAL_MIGRATIONS, migrationClock);

      expect(
        after
          .prepare(
            `SELECT sale_discount_kind, sale_discount_value, sale_discount_reason,
                    sale_discount_authorized_by
             FROM sales`,
          )
          .all(),
      ).toEqual([
        {
          sale_discount_kind: null,
          sale_discount_value: null,
          sale_discount_reason: null,
          sale_discount_authorized_by: null,
        },
      ]);
      const discount = (values: {
        kind: string | null;
        value: number | null;
        reason: string | null;
        authorized_by: string | null;
      }) =>
        after
          .prepare(
            `UPDATE sales
             SET sale_discount_kind = @kind, sale_discount_value = @value,
                 sale_discount_reason = @reason, sale_discount_authorized_by = @authorized_by`,
          )
          .run(values);
      const set = { reason: "Cliente frecuente", authorized_by: null };
      const none = { kind: null, value: null, reason: null, authorized_by: null };
      expect(() => discount({ kind: "PERCENT", value: 1, ...set })).not.toThrow();
      expect(() => discount({ kind: "PERCENT", value: 100, ...set })).not.toThrow();
      expect(() => discount({ kind: "AMOUNT", value: 1, ...set })).not.toThrow();
      expect(() =>
        discount({ kind: "AMOUNT", value: 300, ...set, authorized_by: "u2" }),
      ).not.toThrow();
      expect(() => discount(none)).not.toThrow();
      expect(() => discount({ kind: "PRICE", value: 1, ...set })).toThrow(/CHECK/);
      expect(() => discount({ kind: "PERCENT", value: 0, ...set })).toThrow(/CHECK/);
      expect(() => discount({ kind: "PERCENT", value: 101, ...set })).toThrow(/CHECK/);
      expect(() => discount({ kind: "AMOUNT", value: 0, ...set })).toThrow(/CHECK/);
      expect(() => discount({ kind: "AMOUNT", value: null, ...set })).toThrow(/CHECK/);
      expect(() =>
        discount({ kind: "AMOUNT", value: 1, reason: null, authorized_by: null }),
      ).toThrow(/CHECK/);
      expect(() =>
        discount({ kind: "AMOUNT", value: 1, reason: "  ", authorized_by: null }),
      ).toThrow(/CHECK/);
      expect(() => discount({ ...none, value: 5 })).toThrow(/CHECK/);
      expect(() => discount({ ...none, reason: "Motivo" })).toThrow(/CHECK/);
      expect(() => discount({ ...none, authorized_by: "u2" })).toThrow(/CHECK/);
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
          document_type: "factura_c",
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

    it("give a sale at most one fiscal document waiting for an answer or authorized, of a known sale", () => {
      const database = withSales();

      insertDocument(database, { state: "AUTHORIZED" });

      expect(() => insertDocument(database, { id: "doc-2", number: 42 })).toThrow(/UNIQUE/);
      expect(() =>
        insertDocument(database, { id: "doc-3", sale_id: "missing", number: 43 }),
      ).toThrow(/FOREIGN KEY/);
      database.close();
    });

    it("hold a document of a known type and state with a point of sale and a positive number", () => {
      const database = withSales();

      expect(() => insertDocument(database, { document_type: "FACTURA_A" })).toThrow(/CHECK/);
      expect(() => insertDocument(database, { document_type: "FACTURA_C" })).toThrow(/CHECK/);
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

    let routedSales = 0;

    function routeSale(database: Database, values: { sale_id: string; reason: string }) {
      routedSales += 1;
      database
        .prepare(
          `INSERT INTO deferred_sales (id, sale_id, occurred_at, total, reason, short_code, routed_at)
           VALUES (@id, @sale_id, '2026-09-30T12:00:00.000Z', 1500, @reason, @short_code, '2026-09-30T12:05:00.000Z')`,
        )
        .run({
          ...values,
          id: `deferred-${routedSales}`,
          short_code: `2222222${"ABCDEFGHJKLMNPQR"[routedSales]}`,
        });
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

    it("refuse a refund of no amount or in an unknown state", () => {
      const database = withPaidSale();

      expect(() => insertRefund(database, { amount: 0 })).toThrow(/CHECK/);
      expect(() => insertRefund(database, { state: "DECLINED" })).toThrow(/CHECK/);
      expect(() => insertRefund(database, { method: "CARD" })).toThrow(/CHECK/);
      database.close();
    });
  });
  it("let the stock movements record the two sides of an assembled batch and have the cloud send every stock movement again, over the movements a register holds", () => {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const path = join(folder, "register.sqlite");
      const previous = LOCAL_MIGRATIONS.filter(
        (migration) => migration.name < "0054_assembly_movements",
      );
      expect(LOCAL_MIGRATIONS.map((migration) => migration.name)).toContain(
        "0054_assembly_movements",
      );
      const before = openLocalDatabase(path, previous, migrationClock);
      before.exec(
        `INSERT INTO stock_movements (id, product_id, kind, delta, occurred_at, superseded_by_count_id)
         VALUES ('m1', 'p1', 'adjustment', 4000, '2026-10-09T15:00:00.000Z', 'count-1'),
                ('m2', 'p1', 'opening_count', 2000, '2026-10-09T16:00:00.000Z', NULL);
         UPDATE pulled_table_redeliveries SET cursor = 9 WHERE table_name = 'stock_movements';`,
      );
      before.close();

      const after = openLocalDatabase(path, LOCAL_MIGRATIONS, migrationClock);

      expect(
        after
          .prepare(
            "SELECT id, kind, delta, superseded_by_count_id, expires_on, withdraws_movement_id FROM stock_movements ORDER BY id",
          )
          .all(),
      ).toEqual([
        {
          id: "m1",
          kind: "adjustment",
          delta: 4000,
          superseded_by_count_id: "count-1",
          expires_on: null,
          withdraws_movement_id: null,
        },
        {
          id: "m2",
          kind: "opening_count",
          delta: 2000,
          superseded_by_count_id: null,
          expires_on: null,
          withdraws_movement_id: null,
        },
      ]);
      const insert = (values: { id: string; kind: string; expires_on?: string | null }) =>
        after
          .prepare(
            `INSERT INTO stock_movements (id, product_id, kind, delta, occurred_at, expires_on)
             VALUES (@id, 'p1', @kind, 1000, '2026-10-09T17:00:00.000Z', @expires_on)`,
          )
          .run({ expires_on: null, ...values });
      expect(() => insert({ id: "a1", kind: "assembly_out" })).not.toThrow();
      expect(() => insert({ id: "a2", kind: "assembly_in" })).not.toThrow();
      expect(() => insert({ id: "a3", kind: "assembly_in", expires_on: "2026-12-31" })).toThrow(
        /CHECK/,
      );
      expect(() => insert({ id: "a4", kind: "assembly" })).toThrow(/CHECK/);
      expect(() =>
        insert({ id: "a5", kind: "opening_count", expires_on: "2026-12-31" }),
      ).not.toThrow();
      expect(after.pragma("foreign_key_check")).toEqual([]);
      expect(
        after
          .prepare("SELECT name FROM sqlite_schema WHERE name = 'stock_movements_by_product'")
          .all(),
      ).toHaveLength(1);
      expect(
        after
          .prepare(
            "SELECT cursor FROM pulled_table_redeliveries WHERE table_name = 'stock_movements'",
          )
          .all(),
      ).toEqual([{ cursor: 0 }]);
      after.close();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("let the stock movements record an initial count and its withdrawal and keep the first cash session of a branch, none over the movements it holds", () => {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const path = join(folder, "register.sqlite");
      const previous = LOCAL_MIGRATIONS.filter(
        (migration) => migration.name < "0042_initial_count",
      );
      expect(LOCAL_MIGRATIONS.map((migration) => migration.name)).toContain("0042_initial_count");
      const before = openLocalDatabase(path, previous, migrationClock);
      before.exec(
        `INSERT INTO stock_movements (id, product_id, kind, delta, occurred_at, superseded_by_count_id)
         VALUES ('m1', 'p1', 'adjustment', 4000, '2026-10-09T15:00:00.000Z', 'count-1'),
                ('m2', 'p1', 'receipt', 2000, '2026-10-09T16:00:00.000Z', NULL);`,
      );
      before.close();

      const after = openLocalDatabase(path, LOCAL_MIGRATIONS, migrationClock);

      expect(
        after
          .prepare(
            "SELECT id, kind, delta, superseded_by_count_id, expires_on, withdraws_movement_id FROM stock_movements ORDER BY id",
          )
          .all(),
      ).toEqual([
        {
          id: "m1",
          kind: "adjustment",
          delta: 4000,
          superseded_by_count_id: "count-1",
          expires_on: null,
          withdraws_movement_id: null,
        },
        {
          id: "m2",
          kind: "receipt",
          delta: 2000,
          superseded_by_count_id: null,
          expires_on: null,
          withdraws_movement_id: null,
        },
      ]);
      const insert = (values: {
        id: string;
        kind: string;
        expires_on?: string | null;
        withdraws_movement_id?: string | null;
      }) =>
        after
          .prepare(
            `INSERT INTO stock_movements (id, product_id, kind, delta, occurred_at, expires_on, withdraws_movement_id)
             VALUES (@id, 'p1', @kind, 1000, '2026-10-09T17:00:00.000Z', @expires_on, @withdraws_movement_id)`,
          )
          .run({ expires_on: null, withdraws_movement_id: null, ...values });
      expect(() =>
        insert({ id: "c1", kind: "opening_count", expires_on: "2026-12-31" }),
      ).not.toThrow();
      expect(() => insert({ id: "c2", kind: "opening_count" })).not.toThrow();
      expect(() =>
        insert({ id: "w1", kind: "opening_count_withdrawal", withdraws_movement_id: "c1" }),
      ).not.toThrow();
      expect(() => insert({ id: "w2", kind: "opening_count_withdrawal" })).not.toThrow();
      expect(() => insert({ id: "x1", kind: "receipt", expires_on: "2026-12-31" })).toThrow(
        /CHECK/,
      );
      expect(() =>
        insert({ id: "x2", kind: "opening_count", withdraws_movement_id: "c1" }),
      ).toThrow(/CHECK/);
      expect(() => insert({ id: "x3", kind: "stolen" })).toThrow(/CHECK/);
      expect(after.pragma("foreign_key_check")).toEqual([]);
      expect(
        after
          .prepare("SELECT name FROM sqlite_schema WHERE name = 'stock_movements_by_product'")
          .all(),
      ).toHaveLength(1);

      after
        .prepare(
          "INSERT INTO branch_first_cash_sessions (location_id, opened_at) VALUES ('location', ?)",
        )
        .run("2026-10-10T12:00:00.000Z");
      expect(() =>
        after
          .prepare(
            "INSERT INTO branch_first_cash_sessions (location_id, opened_at) VALUES ('location', ?)",
          )
          .run("2026-10-11T12:00:00.000Z"),
      ).toThrow(/UNIQUE|PRIMARY/);
      expect(
        after.prepare("SELECT table_name FROM pulled_table_redeliveries ORDER BY table_name").all(),
      ).toContainEqual({ table_name: "branch_first_cash_sessions" });
      after.close();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("rebuild deferred sales with an identifier, a short code, and the sale's date and total, carrying over none of the records a register already holds", () => {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const path = join(folder, "register.sqlite");
      const previous = LOCAL_MIGRATIONS.filter(
        (migration) => migration.name < "0044_deferred_sale_records",
      );
      expect(LOCAL_MIGRATIONS.map((migration) => migration.name)).toContain(
        "0044_deferred_sale_records",
      );
      const before = openLocalDatabase(path, previous, migrationClock);
      before.exec(
        `INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
         VALUES ('s1', 'r1', 'device-a', 'u1', '2026-10-09T12:00:00.000Z', 0, 'OPEN');
         INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at)
         VALUES
           ('sale-1', 'r1', 'device-a', 's1', 'u1', 'COMPLETED', '2026-10-09T12:05:00.000Z'),
           ('sale-2', 'r1', 'device-a', 's1', 'u1', 'COMPLETED', '2026-10-09T12:06:00.000Z');
         INSERT INTO fiscal_documents (
           id, sale_id, point_of_sale, document_type, number, issued_on, document, state,
           authorization_code, authorization_code_due_on, reserved_at, resolved_at
         ) VALUES
           ('doc-2', 'sale-2', 12, 'factura_c', 42, '2026-10-09', '{"total":2550}', 'AUTHORIZED',
            '75123456789012', '2026-10-19', '2026-10-09T12:06:00.000Z', '2026-10-09T12:06:01.000Z');
         INSERT INTO deferred_sales (
           sale_id, reason, routed_at, satisfied_by_fiscal_document_id, satisfied_at
         ) VALUES
           ('sale-1', 'fiscally_offline', '2026-10-09T12:05:00.000Z', NULL, NULL),
           ('sale-2', 'unclear_outcome', '2026-10-09T12:06:06.000Z', 'doc-2', '2026-10-09T12:30:00.000Z');`,
      );
      before.close();

      const after = openLocalDatabase(path, LOCAL_MIGRATIONS, migrationClock);

      expect(after.prepare("SELECT * FROM deferred_sales").all()).toEqual([]);
      expect(after.prepare("SELECT id FROM sales ORDER BY id").all()).toEqual([
        { id: "sale-1" },
        { id: "sale-2" },
      ]);
      expect(after.pragma("foreign_key_check")).toEqual([]);

      const insert = (values: {
        id: string;
        sale_id: string;
        short_code: string;
        total?: number;
        satisfied_by_fiscal_document_id?: string | null;
        satisfied_at?: string | null;
      }) =>
        after
          .prepare(
            `INSERT INTO deferred_sales (
               id, sale_id, occurred_at, total, reason, short_code, routed_at,
               satisfied_by_fiscal_document_id, satisfied_at
             ) VALUES (
               @id, @sale_id, '2026-10-09T12:05:00.000Z', @total, 'rejected', @short_code,
               '2026-10-09T12:05:01.000Z', @satisfied_by_fiscal_document_id, @satisfied_at
             )`,
          )
          .run({
            total: 1500,
            satisfied_by_fiscal_document_id: null,
            satisfied_at: null,
            ...values,
          });
      expect(() => insert({ id: "x1", sale_id: "sale-1", short_code: "7KQ4M2P0" })).toThrow(
        /CHECK/,
      );
      expect(() => insert({ id: "x1", sale_id: "sale-1", short_code: "7KQ4M2P" })).toThrow(/CHECK/);
      expect(() => insert({ id: "x1", sale_id: "sale-1", short_code: "7kq4m2p9" })).toThrow(
        /CHECK/,
      );
      expect(() =>
        insert({ id: "x1", sale_id: "sale-1", short_code: "7KQ4M2P9", total: -1 }),
      ).toThrow(/CHECK/);
      expect(() =>
        insert({
          id: "x1",
          sale_id: "sale-1",
          short_code: "7KQ4M2P9",
          satisfied_by_fiscal_document_id: "doc-2",
          satisfied_at: "2026-10-09T12:07:00.000Z",
        }),
      ).toThrow(/an authorized fiscal document of its own sale/);
      expect(() => insert({ id: "x1", sale_id: "sale-1", short_code: "7KQ4M2P9" })).not.toThrow();
      expect(() => insert({ id: "x2", sale_id: "sale-2", short_code: "7KQ4M2P9" })).toThrow(
        /UNIQUE/,
      );
      expect(() => insert({ id: "x1", sale_id: "sale-2", short_code: "R3XW8H5N" })).toThrow(
        /UNIQUE|PRIMARY/,
      );
      expect(() => insert({ id: "x2", sale_id: "sale-1", short_code: "R3XW8H5N" })).toThrow(
        /UNIQUE/,
      );
      expect(() =>
        insert({
          id: "x2",
          sale_id: "sale-2",
          short_code: "R3XW8H5N",
          satisfied_by_fiscal_document_id: "doc-2",
          satisfied_at: "2026-10-09T12:07:00.000Z",
        }),
      ).not.toThrow();

      expect(() =>
        after
          .prepare(
            "UPDATE deferred_sales SET satisfied_by_fiscal_document_id = 'doc-2', satisfied_at = '2026-10-09T12:40:00.000Z' WHERE sale_id = 'sale-1'",
          )
          .run(),
      ).toThrow(/an authorized fiscal document of its own sale/);
      after.close();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("keep who marked a refund done and when, one per refund and whether or not the register holds the refund, none over the refunds it already holds", () => {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const path = join(folder, "register.sqlite");
      const previous = LOCAL_MIGRATIONS.filter(
        (migration) => migration.name < "0045_refund_completions",
      );
      expect(LOCAL_MIGRATIONS.map((migration) => migration.name)).toContain(
        "0045_refund_completions",
      );
      const before = openLocalDatabase(path, previous, migrationClock);
      before.exec(
        `INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
         VALUES ('s1', 'r1', 'device-a', 'u1', '2026-09-30T12:00:00.000Z', 0, 'OPEN');
         INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at)
         VALUES ('sale-1', 'r1', 'device-a', 's1', 'u1', 'CANCELLED', '2026-09-30T12:30:00.000Z');
         INSERT INTO payment_transactions (id, sale_id, kind, method, provider, amount, state, occurred_at, authorized_by, confirmed_at)
         VALUES ('payment-1', 'sale-1', 'SALE', 'TRANSFER', 'NONE', 2000, 'APPROVED', '2026-09-30T12:00:00.000Z', 'u1', '2026-09-30T12:00:00.000Z');
         INSERT INTO payment_refunds (id, payment_id, method, provider, amount, state, occurred_at)
         VALUES ('refund-1', 'payment-1', 'TRANSFER', 'NONE', 2000, 'PENDING', '2026-09-30T12:30:00.000Z');`,
      );
      before.close();

      const after = openLocalDatabase(path, LOCAL_MIGRATIONS, migrationClock);

      expect(after.prepare("SELECT id, state FROM payment_refunds").all()).toEqual([
        { id: "refund-1", state: "PENDING" },
      ]);
      expect(after.prepare("SELECT count(*) AS total FROM refund_completions").get()).toEqual({
        total: 0,
      });
      const complete = (refundId: string) =>
        after
          .prepare(
            "INSERT INTO refund_completions (refund_id, done_by, done_at) VALUES (?, 'u1', '2026-10-10T16:45:00.000Z')",
          )
          .run(refundId);
      expect(() => complete("refund-not-held-yet")).not.toThrow();
      expect(() => complete("refund-1")).not.toThrow();
      expect(() => complete("refund-1")).toThrow(/UNIQUE|PRIMARY/);
      expect(() =>
        after
          .prepare("INSERT INTO refund_completions (refund_id, done_by) VALUES ('x', 'u1')")
          .run(),
      ).toThrow(/NOT NULL/);
      after.close();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("let the prices be looked up by product and the discounts by what they target, keeping the ones a register already holds", () => {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const path = join(folder, "register.sqlite");
      const previous = LOCAL_MIGRATIONS.filter(
        (migration) => migration.name < "0053_price_and_discount_lookups",
      );
      expect(LOCAL_MIGRATIONS.map((migration) => migration.name)).toContain(
        "0053_price_and_discount_lookups",
      );
      const before = openLocalDatabase(path, previous, migrationClock);
      before.exec(
        `INSERT INTO prices (id, product_id, price_list_id, unit_price, valid_from, version)
         VALUES ('price-1', 'p1', 'list-1', 1500, '2026-09-01T00:00:00.000Z', 1);
         INSERT INTO discounts (id, name, kind, percent, target_kind, target_id, valid_from, valid_to, weekdays, active, version)
         VALUES ('discount-1', 'Promo', 'PERCENT_OFF', 10, 'PRODUCT', 'p1', '2026-09-01', '2026-12-31', '[]', 1, 1);`,
      );
      before.close();

      const after = openLocalDatabase(path, LOCAL_MIGRATIONS, migrationClock);

      expect(after.prepare("SELECT id, unit_price FROM prices").all()).toEqual([
        { id: "price-1", unit_price: 1500 },
      ]);
      expect(after.prepare("SELECT id, target_id FROM discounts").all()).toEqual([
        { id: "discount-1", target_id: "p1" },
      ]);
      const planOf = (sql: string): string =>
        after
          .prepare<[], { detail: string }>(`EXPLAIN QUERY PLAN ${sql}`)
          .all()
          .map(({ detail }) => detail)
          .join("\n");
      expect(
        planOf(
          "SELECT id FROM prices WHERE product_id = 'p1' AND valid_from = '2026-09-01T00:00:00.000Z'",
        ),
      ).toMatch(/SEARCH prices USING (COVERING )?INDEX \S+ \(product_id=\? AND valid_from=\?\)/);
      expect(
        planOf("SELECT id FROM discounts WHERE target_kind = 'PRODUCT' AND target_id = 'p1'"),
      ).toMatch(/SEARCH discounts USING (COVERING )?INDEX/);
      after.close();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("add the register's Point terminal assignment, none for a register already holding data", () => {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const path = join(folder, "register.sqlite");
      const previous = LOCAL_MIGRATIONS.filter(
        (migration) => migration.name < "0051_register_point_terminal",
      );
      expect(LOCAL_MIGRATIONS.map((migration) => migration.name)).toContain(
        "0051_register_point_terminal",
      );
      const before = openLocalDatabase(path, previous, migrationClock);
      before.exec(
        "INSERT INTO own_register (id, name, version, removed) VALUES ('r1', 'Caja 1', 1, 0)",
      );
      before.close();

      const after = openLocalDatabase(path, LOCAL_MIGRATIONS, migrationClock);

      expect(after.prepare("SELECT count(*) AS total FROM register_point_terminal").get()).toEqual({
        total: 0,
      });
      const assign = (assigned: number) =>
        after
          .prepare(
            "INSERT INTO register_point_terminal (register_id, assigned, version) VALUES ('r1', ?, 1)",
          )
          .run(assigned);
      expect(() => assign(2)).toThrow(/CHECK/);
      expect(() => assign(1)).not.toThrow();
      expect(() => assign(0)).toThrow(/UNIQUE|PRIMARY/);
      after.close();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("keep the paid orders without a sale, one per payment, none over the payments a register already holds", () => {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const path = join(folder, "register.sqlite");
      const previous = LOCAL_MIGRATIONS.filter(
        (migration) => migration.name < "0052_paid_orders_without_sale",
      );
      expect(LOCAL_MIGRATIONS.map((migration) => migration.name)).toContain(
        "0052_paid_orders_without_sale",
      );
      const before = openLocalDatabase(path, previous, migrationClock);
      before.exec(
        `INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
         VALUES ('s1', 'r1', 'device-a', 'u1', '2026-09-30T12:00:00.000Z', 0, 'OPEN');
         INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at)
         VALUES ('sale-1', 'r1', 'device-a', 's1', 'u1', 'OPEN', NULL);
         INSERT INTO payment_transactions (id, sale_id, kind, method, provider, amount, tendered, state, occurred_at)
         VALUES ('payment-1', 'sale-1', 'SALE', 'CASH', 'NONE', 2000, 2000, 'APPROVED', '2026-09-30T12:00:00.000Z');`,
      );
      before.close();

      const after = openLocalDatabase(path, LOCAL_MIGRATIONS, migrationClock);

      expect(after.prepare("SELECT id, state FROM payment_transactions").all()).toEqual([
        { id: "payment-1", state: "APPROVED" },
      ]);
      expect(after.prepare("SELECT count(*) AS total FROM paid_orders_without_sale").get()).toEqual(
        {
          total: 0,
        },
      );
      const record = (id: string, method = "QR", provider = "MERCADOPAGO_QR") =>
        after
          .prepare(
            `INSERT INTO paid_orders_without_sale (payment_transaction_id, sale_id, method, provider, amount, created_at, recorded_at)
             VALUES (?, 'sale-gone', ?, ?, 5000, '2026-10-10T16:00:00.000Z', '2026-10-10T16:45:00.000Z')`,
          )
          .run(id, method, provider);
      expect(() => record("order-1")).not.toThrow();
      expect(() => record("order-2", "POINT", "MERCADOPAGO_POINT")).not.toThrow();
      expect(() => record("order-1")).toThrow(/UNIQUE|PRIMARY/);
      expect(() => record("order-3", "CASH", "NONE")).toThrow(/CHECK/);
      expect(() => record("order-4", "QR", "MERCADOPAGO_POINT")).toThrow(/CHECK/);
      expect(
        after
          .prepare("SELECT payment_transaction_id, resolved_at FROM paid_orders_without_sale")
          .all(),
      ).toEqual([
        { payment_transaction_id: "order-1", resolved_at: null },
        { payment_transaction_id: "order-2", resolved_at: null },
      ]);
      after.close();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("let a sale be voided, a stock movement give back what a sale took and a deferred sale be cancelled, keeping the sales, movements and deferred sales a register already holds", () => {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const path = join(folder, "register.sqlite");
      const previous = LOCAL_MIGRATIONS.filter((migration) => migration.name < "0057_voided_sales");
      expect(LOCAL_MIGRATIONS.map((migration) => migration.name)).toContain("0057_voided_sales");
      const before = openLocalDatabase(path, previous, migrationClock);
      before.exec(
        `INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
         VALUES ('s1', 'r1', 'device-a', 'u1', '2026-10-09T12:00:00.000Z', 0, 'OPEN');
         INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at)
         VALUES ('sale-1', 'r1', 'device-a', 's1', 'u1', 'COMPLETED', '2026-10-09T12:05:00.000Z'),
                ('sale-2', 'r1', 'device-a', 's1', 'u1', 'COMPLETED', '2026-10-09T12:06:00.000Z'),
                ('sale-3', 'r1', 'device-a', 's1', 'u1', 'OPEN', NULL);
         INSERT INTO sale_lines (id, sale_id, position, product_id, product_name, quantity, list_unit_price, price_list_id, line_total)
         VALUES ('line-1', 'sale-1', 1, 'p1', 'Yerba', 2, 1500, 'list-1', 3000);
         INSERT INTO stock_movements (id, product_id, kind, sale_line_id, delta, occurred_at)
         VALUES ('movement-1', 'p1', 'sale', 'line-1', -2000, '2026-10-09T12:05:00.000Z'),
                ('movement-2', 'p1', 'loss', NULL, -500, '2026-10-09T12:07:00.000Z');
         INSERT INTO deferred_sales (id, sale_id, occurred_at, total, reason, short_code, routed_at)
         VALUES ('deferred-1', 'sale-2', '2026-10-09T12:06:00.000Z', 2550, 'fiscally_offline', '23456789', '2026-10-09T12:06:00.000Z');`,
      );
      before.close();

      const after = openLocalDatabase(path, LOCAL_MIGRATIONS, migrationClock);

      expect(
        after
          .prepare("SELECT id, state, voided_at, void_authorized_by FROM sales ORDER BY id")
          .all(),
      ).toEqual([
        { id: "sale-1", state: "COMPLETED", voided_at: null, void_authorized_by: null },
        { id: "sale-2", state: "COMPLETED", voided_at: null, void_authorized_by: null },
        { id: "sale-3", state: "OPEN", voided_at: null, void_authorized_by: null },
      ]);
      expect(
        after
          .prepare("SELECT id, kind, sale_line_id, delta FROM stock_movements ORDER BY id")
          .all(),
      ).toEqual([
        { id: "movement-1", kind: "sale", sale_line_id: "line-1", delta: -2000 },
        { id: "movement-2", kind: "loss", sale_line_id: null, delta: -500 },
      ]);
      expect(after.prepare("SELECT id, cancelled_at FROM deferred_sales").all()).toEqual([
        { id: "deferred-1", cancelled_at: null },
      ]);
      expect(after.pragma("foreign_key_check")).toEqual([]);
      expect(
        after
          .prepare("SELECT name FROM sqlite_schema WHERE name = 'stock_movements_by_product'")
          .all(),
      ).toHaveLength(1);
      after.close();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  describe("the voided sales", () => {
    function withCompletedSale() {
      const database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
      database.exec(
        `INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
         VALUES ('s1', 'r1', 'device-a', 'u1', '2026-10-09T12:00:00.000Z', 0, 'OPEN');
         INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at)
         VALUES ('sale-1', 'r1', 'device-a', 's1', 'u1', 'COMPLETED', '2026-10-09T12:05:00.000Z');
         INSERT INTO sale_lines (id, sale_id, position, product_id, product_name, quantity, list_unit_price, price_list_id, line_total)
         VALUES ('line-1', 'sale-1', 1, 'p1', 'Yerba', 2, 1500, 'list-1', 3000);
         INSERT INTO deferred_sales (id, sale_id, occurred_at, total, reason, short_code, routed_at)
         VALUES ('deferred-1', 'sale-1', '2026-10-09T12:05:00.000Z', 3000, 'fiscally_offline', '23456789', '2026-10-09T12:05:00.000Z');`,
      );
      return database;
    }

    it("date a voided sale with its voiding and name who authorized it only then", () => {
      const database = withCompletedSale();
      const voidSale = (voidedAt: string | null, authorizedBy: string | null) =>
        database
          .prepare(
            "UPDATE sales SET state = 'VOIDED', voided_at = ?, void_authorized_by = ? WHERE id = 'sale-1'",
          )
          .run(voidedAt, authorizedBy);

      expect(() => voidSale(null, null)).toThrow(/CHECK/);
      expect(() => voidSale(null, "u2")).toThrow(/CHECK/);
      expect(() => voidSale("2026-10-09T12:10:00.000Z", "u2")).not.toThrow();
      expect(database.prepare("SELECT voided_at, void_authorized_by FROM sales").all()).toEqual([
        { voided_at: "2026-10-09T12:10:00.000Z", void_authorized_by: "u2" },
      ]);
      expect(() => database.prepare("UPDATE sales SET state = 'COMPLETED'").run()).toThrow(/CHECK/);
      database.close();
    });

    it("refuse a voiding date or an authorizer on a sale that is not voided", () => {
      const database = withCompletedSale();

      expect(() =>
        database.prepare("UPDATE sales SET voided_at = '2026-10-09T12:10:00.000Z'").run(),
      ).toThrow(/CHECK/);
      expect(() => database.prepare("UPDATE sales SET void_authorized_by = 'u2'").run()).toThrow(
        /CHECK/,
      );
      database.close();
    });

    it("let a stock movement give back what a sale line took, and refuse it on any other kind", () => {
      const database = withCompletedSale();
      const record = (kind: string, saleLineId: string | null) =>
        database
          .prepare(
            `INSERT INTO stock_movements (id, product_id, kind, sale_line_id, delta, occurred_at)
             VALUES (@id, 'p1', @kind, @sale_line_id, 2000, '2026-10-09T12:10:00.000Z')`,
          )
          .run({ id: `movement-${kind}-${saleLineId}`, kind, sale_line_id: saleLineId });

      expect(() => record("sale_void", "line-1")).not.toThrow();
      expect(() => record("sale_void", null)).not.toThrow();
      expect(() => record("loss", "line-1")).toThrow(/CHECK/);
      expect(() => record("sale_returned", null)).toThrow(/CHECK/);
      database.close();
    });

    it("cancel a deferred sale that was not satisfied, and satisfy a cancelled one never", () => {
      const database = withCompletedSale();
      database.exec(
        `INSERT INTO fiscal_documents (
           id, sale_id, point_of_sale, document_type, number, issued_on, document, state,
           authorization_code, authorization_code_due_on, reserved_at, resolved_at
         ) VALUES ('doc-1', 'sale-1', 12, 'factura_c', 41, '2026-10-09', '{"total":3000}', 'AUTHORIZED',
            '75123456789012', '2026-10-19', '2026-10-09T12:05:00.000Z', '2026-10-09T12:05:01.000Z')`,
      );

      expect(() =>
        database
          .prepare("UPDATE deferred_sales SET cancelled_at = '2026-10-09T12:10:00.000Z'")
          .run(),
      ).not.toThrow();
      expect(() =>
        database
          .prepare(
            `UPDATE deferred_sales
             SET satisfied_by_fiscal_document_id = 'doc-1', satisfied_at = '2026-10-09T12:11:00.000Z'`,
          )
          .run(),
      ).toThrow(/CHECK/);
      database.close();
    });

    it("cancel a satisfied deferred sale never", () => {
      const database = withCompletedSale();
      database.exec(
        `INSERT INTO fiscal_documents (
           id, sale_id, point_of_sale, document_type, number, issued_on, document, state,
           authorization_code, authorization_code_due_on, reserved_at, resolved_at
         ) VALUES ('doc-1', 'sale-1', 12, 'factura_c', 41, '2026-10-09', '{"total":3000}', 'AUTHORIZED',
            '75123456789012', '2026-10-19', '2026-10-09T12:05:00.000Z', '2026-10-09T12:05:01.000Z');
         UPDATE deferred_sales
         SET satisfied_by_fiscal_document_id = 'doc-1', satisfied_at = '2026-10-09T12:11:00.000Z';`,
      );

      expect(() =>
        database
          .prepare("UPDATE deferred_sales SET cancelled_at = '2026-10-09T12:12:00.000Z'")
          .run(),
      ).toThrow(/CHECK/);
      database.close();
    });
  });

  it("let an offline point of sale hold the highest number synced and an offline block be used up, keeping what a register already holds", () => {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const path = join(folder, "register.sqlite");
      const previous = LOCAL_MIGRATIONS.filter(
        (migration) => migration.name < "0055_offline_numbering_floor",
      );
      expect(LOCAL_MIGRATIONS.map((migration) => migration.name)).toContain(
        "0055_offline_numbering_floor",
      );
      const before = openLocalDatabase(path, previous, migrationClock);
      before.exec(
        `INSERT INTO register_offline_point_of_sale (register_id, point_of_sale_number, tax_authority_last_authorized_number, version)
         VALUES ('r1', 31, 1000, 2);
         INSERT INTO offline_number_blocks (id, point_of_sale, document_type, first_number, last_number, status, version)
         VALUES ('b1', 31, 'factura_c', 1001, 2000, 'in_use', 3);`,
      );
      before.close();

      const after = openLocalDatabase(path, LOCAL_MIGRATIONS, migrationClock);

      expect(
        after
          .prepare(
            "SELECT register_id, point_of_sale_number, version FROM register_offline_point_of_sale",
          )
          .all(),
      ).toEqual([{ register_id: "r1", point_of_sale_number: 31, version: 2 }]);
      expect(
        after
          .prepare(
            "SELECT point_of_sale, document_type, tax_authority_last_authorized_number, highest_synced_offline_number FROM offline_series_counts",
          )
          .all(),
      ).toEqual([
        {
          point_of_sale: 31,
          document_type: "factura_c",
          tax_authority_last_authorized_number: 1000,
          highest_synced_offline_number: null,
        },
      ]);
      expect(
        after
          .prepare(
            "SELECT id, point_of_sale, document_type, first_number, last_number, status, version FROM offline_number_blocks",
          )
          .all(),
      ).toEqual([
        {
          id: "b1",
          point_of_sale: 31,
          document_type: "factura_c",
          first_number: 1001,
          last_number: 2000,
          status: "in_use",
          version: 3,
        },
      ]);
      const setHighest = (value: number) =>
        after
          .prepare("UPDATE offline_series_counts SET highest_synced_offline_number = ?")
          .run(value);
      expect(() => setHighest(1500)).not.toThrow();
      expect(() => setHighest(-1)).toThrow(/CHECK/);
      const insertBlock = after.prepare(
        `INSERT INTO offline_number_blocks (
           id, point_of_sale, document_type, first_number, last_number, status, version
         ) VALUES (@id, @point_of_sale, @document_type, @first_number, @last_number, @status, 1)`,
      );
      const block = {
        id: "b2",
        point_of_sale: 31,
        document_type: "factura_c",
        first_number: 2001,
        last_number: 3000,
        status: "used_up",
      };
      expect(() => insertBlock.run({ ...block, id: "b0", status: "closed" })).toThrow(/CHECK/);
      expect(() => insertBlock.run({ ...block, id: "b0", point_of_sale: 0 })).toThrow(/CHECK/);
      expect(() => insertBlock.run({ ...block, id: "b0", document_type: "FACTURA_C" })).toThrow(
        /CHECK/,
      );
      expect(() => insertBlock.run({ ...block, id: "b0", last_number: 2000 })).toThrow(/CHECK/);
      expect(() => insertBlock.run(block)).not.toThrow();
      expect(() => insertBlock.run({ ...block, id: "b3", last_number: 4000 })).toThrow(/UNIQUE/);
      after.close();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("let a point of sale be frozen and a sale be deferred for its frozen numbering, keeping the points of sale and deferred sales a register already holds", () => {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const path = join(folder, "register.sqlite");
      const previous = LOCAL_MIGRATIONS.filter(
        (migration) => migration.name < "0056_numbering_freeze",
      );
      expect(LOCAL_MIGRATIONS.map((migration) => migration.name)).toContain(
        "0056_numbering_freeze",
      );
      const before = openLocalDatabase(path, previous, migrationClock);
      before.exec(
        `INSERT INTO register_point_of_sale (register_id, point_of_sale_number, fiscal_address_id, tax_authority_last_authorized_number, version)
         VALUES ('r1', 12, 'address-1', 40, 3);
         INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
         VALUES ('s1', 'r1', 'device-a', 'u1', '2026-10-09T12:00:00.000Z', 0, 'OPEN');
         INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at)
         VALUES
           ('sale-1', 'r1', 'device-a', 's1', 'u1', 'COMPLETED', '2026-10-09T12:05:00.000Z'),
           ('sale-2', 'r1', 'device-a', 's1', 'u1', 'COMPLETED', '2026-10-09T12:06:00.000Z');
         INSERT INTO fiscal_documents (
           id, sale_id, point_of_sale, document_type, number, issued_on, document, state,
           authorization_code, authorization_code_due_on, reserved_at, resolved_at
         ) VALUES
           ('doc-2', 'sale-2', 12, 'factura_c', 42, '2026-10-09', '{"total":2550}', 'AUTHORIZED',
            '75123456789012', '2026-10-19', '2026-10-09T12:06:00.000Z', '2026-10-09T12:06:01.000Z');
         INSERT INTO deferred_sales (
           id, sale_id, occurred_at, total, reason, short_code, routed_at,
           satisfied_by_fiscal_document_id, satisfied_at
         ) VALUES
           ('d1', 'sale-1', '2026-10-09T12:05:00.000Z', 1500, 'fiscally_offline', '7KQ4M2P9',
            '2026-10-09T12:05:01.000Z', NULL, NULL),
           ('d2', 'sale-2', '2026-10-09T12:06:00.000Z', 2550, 'unclear_outcome', 'R3XW8H5N',
            '2026-10-09T12:06:06.000Z', 'doc-2', '2026-10-09T12:30:00.000Z');`,
      );
      before.close();

      const after = openLocalDatabase(path, LOCAL_MIGRATIONS, migrationClock);

      expect(
        after
          .prepare(
            "SELECT register_id, point_of_sale_number, tax_authority_last_authorized_number, numbering_frozen, version FROM register_point_of_sale",
          )
          .all(),
      ).toEqual([
        {
          register_id: "r1",
          point_of_sale_number: 12,
          tax_authority_last_authorized_number: 40,
          numbering_frozen: 0,
          version: 3,
        },
      ]);
      expect(
        after
          .prepare(
            `SELECT id, sale_id, occurred_at, total, reason, short_code, routed_at,
                    satisfied_by_fiscal_document_id, satisfied_at
             FROM deferred_sales ORDER BY id`,
          )
          .all(),
      ).toEqual([
        {
          id: "d1",
          sale_id: "sale-1",
          occurred_at: "2026-10-09T12:05:00.000Z",
          total: 1500,
          reason: "fiscally_offline",
          short_code: "7KQ4M2P9",
          routed_at: "2026-10-09T12:05:01.000Z",
          satisfied_by_fiscal_document_id: null,
          satisfied_at: null,
        },
        {
          id: "d2",
          sale_id: "sale-2",
          occurred_at: "2026-10-09T12:06:00.000Z",
          total: 2550,
          reason: "unclear_outcome",
          short_code: "R3XW8H5N",
          routed_at: "2026-10-09T12:06:06.000Z",
          satisfied_by_fiscal_document_id: "doc-2",
          satisfied_at: "2026-10-09T12:30:00.000Z",
        },
      ]);
      expect(after.pragma("foreign_key_check")).toEqual([]);

      const setFrozen = (value: number) =>
        after.prepare("UPDATE register_point_of_sale SET numbering_frozen = ?").run(value);
      expect(() => setFrozen(1)).not.toThrow();
      expect(() => setFrozen(0)).not.toThrow();
      expect(() => setFrozen(2)).toThrow(/CHECK/);

      const defer = (values: { id: string; sale_id: string; short_code: string; reason: string }) =>
        after
          .prepare(
            `INSERT INTO deferred_sales (id, sale_id, occurred_at, total, reason, short_code, routed_at)
             VALUES (@id, @sale_id, '2026-10-09T12:05:00.000Z', 1500, @reason, @short_code,
                     '2026-10-09T12:05:01.000Z')`,
          )
          .run(values);
      after.exec("DELETE FROM deferred_sales WHERE id = 'd1'");
      expect(() =>
        defer({ id: "x1", sale_id: "sale-1", short_code: "7KQ4M2P9", reason: "forgotten" }),
      ).toThrow(/CHECK/);
      expect(() =>
        defer({ id: "x1", sale_id: "sale-1", short_code: "7KQ4M2P9", reason: "numbering_frozen" }),
      ).not.toThrow();
      expect(() =>
        defer({ id: "x2", sale_id: "sale-1", short_code: "7KQ4M2PA", reason: "rejected" }),
      ).toThrow(/UNIQUE/);
      expect(() =>
        after
          .prepare(
            "UPDATE deferred_sales SET satisfied_by_fiscal_document_id = 'doc-2', satisfied_at = '2026-10-09T12:40:00.000Z' WHERE sale_id = 'sale-1'",
          )
          .run(),
      ).toThrow(/an authorized fiscal document of its own sale/);
      after.close();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("let a sale be deferred for a clock behind its mark and hold the clock marks, their corrections and the tax authority's last authorized day, keeping the points of sale and deferred sales a register already holds", () => {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const path = join(folder, "register.sqlite");
      const previous = LOCAL_MIGRATIONS.filter(
        (migration) => migration.name < "0058_register_clock_guard",
      );
      expect(LOCAL_MIGRATIONS.map((migration) => migration.name)).toContain(
        "0058_register_clock_guard",
      );
      const before = openLocalDatabase(path, previous, migrationClock);
      before.exec(
        `INSERT INTO register_point_of_sale (register_id, point_of_sale_number, fiscal_address_id, tax_authority_last_authorized_number, version)
         VALUES ('r1', 12, 'address-1', 40, 3);
         INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
         VALUES ('s1', 'r1', 'device-a', 'u1', '2026-10-09T12:00:00.000Z', 0, 'OPEN');
         INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at)
         VALUES
           ('sale-1', 'r1', 'device-a', 's1', 'u1', 'COMPLETED', '2026-10-09T12:05:00.000Z'),
           ('sale-2', 'r1', 'device-a', 's1', 'u1', 'COMPLETED', '2026-10-09T12:06:00.000Z');
         INSERT INTO deferred_sales (
           id, sale_id, occurred_at, total, reason, short_code, routed_at, cancelled_at
         ) VALUES
           ('d1', 'sale-1', '2026-10-09T12:05:00.000Z', 1500, 'fiscally_offline', '7KQ4M2P9',
            '2026-10-09T12:05:01.000Z', NULL),
           ('d2', 'sale-2', '2026-10-09T12:06:00.000Z', 2550, 'rejected', 'R3XW8H5N',
            '2026-10-09T12:06:06.000Z', '2026-10-09T12:30:00.000Z');
         INSERT INTO offline_fiscal_documents (
           id, sale_id, point_of_sale, document_type, number, issued_on, generated_at, generation_stamp,
           offline_authorization_code, fortnight_start, fortnight_end, document, buyer_document_type,
           buyer_document_number, cause
         ) VALUES (
           'offline-1', 'sale-1', 31, 'factura_c', 7, '2026-10-09', '2026-10-09T12:05:00.000Z',
           '20261009090500', '75123456789012', '2026-10-01', '2026-10-15', '{}', 99, 0, 'no_connectivity'
         );`,
      );
      before.close();

      const after = openLocalDatabase(path, LOCAL_MIGRATIONS, migrationClock);
      expect(
        after.prepare("SELECT id, sale_id, number, cause FROM offline_fiscal_documents").all(),
      ).toEqual([{ id: "offline-1", sale_id: "sale-1", number: 7, cause: "no_connectivity" }]);
      const issueOffline = (cause: string) =>
        after
          .prepare(
            `INSERT INTO offline_fiscal_documents (
               id, sale_id, point_of_sale, document_type, number, issued_on, generated_at, generation_stamp,
               offline_authorization_code, fortnight_start, fortnight_end, document, buyer_document_type,
               buyer_document_number, cause
             ) VALUES (
               'offline-2', 'sale-2', 31, 'factura_c', 8, '2026-10-09', '2026-10-09T12:06:00.000Z',
               '20261009090600', '75123456789012', '2026-10-01', '2026-10-15', '{}', 99, 0, ?
             )`,
          )
          .run(cause);
      expect(() => issueOffline("forgotten")).toThrow(/CHECK/);
      expect(() => issueOffline("clock_behind")).toThrow(/CHECK/);

      expect(
        after
          .prepare(
            `SELECT point_of_sale_number, tax_authority_last_authorized_number,
                    tax_authority_last_authorized_issued_on, version
             FROM register_point_of_sale`,
          )
          .all(),
      ).toEqual([
        {
          point_of_sale_number: 12,
          tax_authority_last_authorized_number: 40,
          tax_authority_last_authorized_issued_on: null,
          version: 3,
        },
      ]);
      expect(
        after
          .prepare(
            "SELECT id, sale_id, reason, short_code, cancelled_at FROM deferred_sales ORDER BY id",
          )
          .all(),
      ).toEqual([
        {
          id: "d1",
          sale_id: "sale-1",
          reason: "fiscally_offline",
          short_code: "7KQ4M2P9",
          cancelled_at: null,
        },
        {
          id: "d2",
          sale_id: "sale-2",
          reason: "rejected",
          short_code: "R3XW8H5N",
          cancelled_at: "2026-10-09T12:30:00.000Z",
        },
      ]);
      expect(after.pragma("foreign_key_check")).toEqual([]);
      expect(
        after
          .prepare(
            "SELECT cursor FROM pulled_table_redeliveries WHERE table_name = 'register_point_of_sale'",
          )
          .all(),
      ).toEqual([{ cursor: 0 }]);

      const defer = (reason: string) =>
        after.prepare("DELETE FROM deferred_sales WHERE id = 'd1'").run() &&
        after
          .prepare(
            `INSERT INTO deferred_sales (id, sale_id, occurred_at, total, reason, short_code, routed_at)
             VALUES ('x1', 'sale-1', '2026-10-09T12:05:00.000Z', 1500, ?, '7KQ4M2P9',
                     '2026-10-09T12:05:01.000Z')`,
          )
          .run(reason);
      expect(() => defer("forgotten")).toThrow(/CHECK/);
      expect(() => defer("clock_behind")).not.toThrow();
      expect(() =>
        after
          .prepare(
            "UPDATE deferred_sales SET cancelled_at = '2026-10-09T12:40:00.000Z', satisfied_at = '2026-10-09T12:41:00.000Z', satisfied_by_fiscal_document_id = 'doc-x' WHERE id = 'x1'",
          )
          .run(),
      ).toThrow(/an authorized fiscal document of its own sale/);
      expect(() =>
        after
          .prepare(
            "UPDATE deferred_sales SET satisfied_at = '2026-10-09T12:41:00.000Z' WHERE id = 'x1'",
          )
          .run(),
      ).toThrow(/CHECK/);
      after.close();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  describe("the register's clock marks and corrections", () => {
    const insertMark = (database: ReturnType<typeof openLocalDatabase>, values: object) =>
      database
        .prepare(
          `INSERT INTO register_clock_marks (point_of_sale, document_type, reading)
           VALUES (@point_of_sale, @document_type, @reading)`,
        )
        .run(values);
    const mark = {
      point_of_sale: 12,
      document_type: "factura_c",
      reading: "2026-10-09T12:05:00.000Z",
    };

    it("hold one mark per point of sale and document type", () => {
      const database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);

      expect(() => insertMark(database, { ...mark, point_of_sale: 0 })).toThrow(/CHECK/);
      expect(() => insertMark(database, { ...mark, document_type: "factura_a" })).toThrow(/CHECK/);
      expect(() => insertMark(database, { ...mark, reading: null })).toThrow(/NOT NULL/);
      expect(() => insertMark(database, mark)).not.toThrow();
      expect(() => insertMark(database, mark)).toThrow(/UNIQUE|PRIMARY KEY/);
      expect(() => insertMark(database, { ...mark, point_of_sale: 31 })).not.toThrow();
      database.close();
    });

    it("record each lowering of a mark with who made it and in which period, only as a lowering", () => {
      const database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
      const record = database.prepare(
        `INSERT INTO clock_corrections (
           period, register_id, actor_id, point_of_sale, document_type, previous_reading, corrected_reading
         ) VALUES (@period, 'r1', 'u1', @point_of_sale, @document_type, @previous_reading, @corrected_reading)`,
      );
      const correction = {
        period: "s1",
        point_of_sale: 12,
        document_type: "factura_c",
        previous_reading: "2026-10-09T12:05:00.000Z",
        corrected_reading: "2026-10-09T11:00:00.000Z",
      };

      expect(() => record.run({ ...correction, point_of_sale: 0 })).toThrow(/CHECK/);
      expect(() => record.run({ ...correction, document_type: "factura_a" })).toThrow(/CHECK/);
      expect(() =>
        record.run({ ...correction, corrected_reading: "2026-10-09T12:05:00.000Z" }),
      ).toThrow(/CHECK/);
      expect(() => record.run({ ...correction, period: null })).toThrow(/NOT NULL/);
      expect(() => record.run(correction)).not.toThrow();
      expect(() => record.run({ ...correction, point_of_sale: 31 })).not.toThrow();
      expect(
        database
          .prepare("SELECT period, point_of_sale FROM clock_corrections ORDER BY point_of_sale")
          .all(),
      ).toEqual([
        { period: "s1", point_of_sale: 12 },
        { period: "s1", point_of_sale: 31 },
      ]);
      database.close();
    });

    it("hold the tax authority's last authorized day of the point of sale, none until it is pulled", () => {
      const database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
      database.exec(
        `INSERT INTO register_point_of_sale (register_id, point_of_sale_number, fiscal_address_id, version)
         VALUES ('r1', 12, 'address-1', 1)`,
      );

      expect(
        database
          .prepare(
            "SELECT tax_authority_last_authorized_issued_on AS day FROM register_point_of_sale",
          )
          .all(),
      ).toEqual([{ day: null }]);
      expect(() =>
        database
          .prepare(
            "UPDATE register_point_of_sale SET tax_authority_last_authorized_issued_on = '2026-10-09'",
          )
          .run(),
      ).not.toThrow();
      database.close();
    });
  });

  it("tell a register awaiting its orphan sweep without a copy from one restored from a copy, keeping the ones already awaiting as from a copy", () => {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const path = join(folder, "register.sqlite");
      const previous = LOCAL_MIGRATIONS.filter(
        (migration) => migration.name < "0076_awaiting_orphan_sweep_origin",
      );
      expect(LOCAL_MIGRATIONS.map((migration) => migration.name)).toContain(
        "0076_awaiting_orphan_sweep_origin",
      );
      const before = openLocalDatabase(path, previous, migrationClock);
      before.prepare("INSERT INTO awaiting_orphan_sweep (register_id) VALUES ('register-a')").run();
      before.close();

      const after = openLocalDatabase(path, LOCAL_MIGRATIONS, migrationClock);

      expect(after.prepare("SELECT * FROM awaiting_orphan_sweep").all()).toEqual([
        { register_id: "register-a", from_copy: 1 },
      ]);
      expect(() =>
        after
          .prepare(
            "INSERT INTO awaiting_orphan_sweep (register_id, from_copy) VALUES ('register-b', 2)",
          )
          .run(),
      ).toThrow(/CHECK/);
      after.close();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("record the predecessor installations of a restored register, keeping the sync state a register already holds", () => {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const path = join(folder, "register.sqlite");
      const previous = LOCAL_MIGRATIONS.filter(
        (migration) => migration.name < "0063_register_predecessor",
      );
      expect(LOCAL_MIGRATIONS.map((migration) => migration.name)).toContain(
        "0063_register_predecessor",
      );
      const before = openLocalDatabase(path, previous, migrationClock);
      before
        .prepare("UPDATE sync_state SET pull_cursor = 9, device_id = 'device-a' WHERE id = 1")
        .run();
      before.close();

      const after = openLocalDatabase(path, LOCAL_MIGRATIONS, migrationClock);

      expect(after.prepare("SELECT pull_cursor, device_id FROM sync_state").all()).toEqual([
        { pull_cursor: 9, device_id: "device-a" },
      ]);
      expect(after.prepare("SELECT * FROM register_predecessor").all()).toEqual([]);
      const record = after.prepare(
        "INSERT INTO register_predecessor (device_id, last_acknowledged_seq) VALUES (?, ?)",
      );
      expect(() => record.run("device-a", -1)).toThrow(/CHECK/);
      expect(() => record.run("device-a", 0)).not.toThrow();
      expect(() => record.run("device-a", 3)).toThrow(/UNIQUE|PRIMARY KEY/);
      after.close();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("hold the credit note of a voided sale once per sale, its answer kept consistent with its state", () => {
    const database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
    database.exec(
      `INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
       VALUES ('s1', 'r1', 'device-a', 'u1', '2026-10-09T12:00:00.000Z', 0, 'OPEN');
       INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at)
       VALUES ('sale-1', 'r1', 'device-a', 's1', 'u1', 'COMPLETED', '2026-10-09T12:05:00.000Z'),
              ('sale-2', 'r1', 'device-a', 's1', 'u1', 'COMPLETED', '2026-10-09T12:06:00.000Z'),
              ('sale-3', 'r1', 'device-a', 's1', 'u1', 'COMPLETED', '2026-10-09T12:07:00.000Z'),
              ('sale-4', 'r1', 'device-a', 's1', 'u1', 'COMPLETED', '2026-10-09T12:08:00.000Z'),
              ('sale-5', 'r1', 'device-a', 's1', 'u1', 'COMPLETED', '2026-10-09T12:09:00.000Z');`,
    );
    const insert = database.prepare(
      `INSERT INTO sale_credit_notes (
         id, sale_id, total, receiver_tax_status_code, corrected_voucher_type,
         corrected_point_of_sale, corrected_number, state, point_of_sale, number, issued_on,
         issued_at, authorization_code, authorization_code_due_on, recorded_at, answered_at
       ) VALUES (
         @id, @sale_id, 3000, 5, 11, 12, 41, @state, @point_of_sale, @number, @issued_on,
         @issued_at, @authorization_code, @authorization_code_due_on, '2026-10-09T12:30:00.000Z',
         @answered_at
       )`,
    );
    const inProgress = {
      id: "note-1",
      sale_id: "sale-1",
      state: "IN_PROGRESS",
      point_of_sale: null,
      number: null,
      issued_on: null,
      issued_at: null,
      authorization_code: null,
      authorization_code_due_on: null,
      answered_at: null,
    };
    const authorized = {
      ...inProgress,
      state: "AUTHORIZED",
      point_of_sale: 12,
      number: 7,
      issued_on: "2026-10-09",
      issued_at: "2026-10-09T12:30:40.000Z",
      authorization_code: "75123456789012",
      authorization_code_due_on: "2026-10-19",
      answered_at: "2026-10-09T12:31:00.000Z",
    };

    expect(() => insert.run(inProgress)).not.toThrow();
    expect(() => insert.run({ ...inProgress, id: "note-again" })).toThrow(/UNIQUE/);
    expect(() => insert.run({ ...authorized, id: "note-2", sale_id: "sale-2" })).not.toThrow();
    expect(() => insert.run({ ...inProgress, id: "note-3", sale_id: "missing" })).toThrow(
      /FOREIGN KEY/,
    );
    expect(() =>
      insert.run({ ...authorized, id: "note-4", sale_id: "sale-3", authorization_code: null }),
    ).toThrow(/CHECK/);
    expect(() =>
      insert.run({ ...authorized, id: "note-5", sale_id: "sale-3", number: null }),
    ).toThrow(/CHECK/);
    expect(() =>
      insert.run({ ...authorized, id: "note-15", sale_id: "sale-3", issued_at: null }),
    ).toThrow(/CHECK/);
    expect(() =>
      insert.run({
        ...inProgress,
        id: "note-16",
        sale_id: "sale-3",
        issued_at: "2026-10-09T12:30:40.000Z",
      }),
    ).toThrow(/CHECK/);
    expect(() => insert.run({ ...inProgress, id: "note-6", sale_id: "sale-3", number: 7 })).toThrow(
      /CHECK/,
    );
    expect(() =>
      insert.run({ ...inProgress, id: "note-7", sale_id: "sale-3", answered_at: "2026-10-09" }),
    ).toThrow(/CHECK/);
    expect(() =>
      insert.run({ ...authorized, id: "note-8", sale_id: "sale-3", answered_at: null }),
    ).toThrow(/CHECK/);
    expect(() =>
      insert.run({ ...inProgress, id: "note-9", sale_id: "sale-3", state: "REJECTED" }),
    ).toThrow(/CHECK/);
    expect(() =>
      insert.run({
        ...inProgress,
        id: "note-10",
        sale_id: "sale-4",
        state: "REJECTED",
        answered_at: "2026-10-09T12:31:00.000Z",
      }),
    ).not.toThrow();
    expect(() =>
      insert.run({ ...inProgress, id: "note-11", sale_id: "sale-3", state: "VOIDED" }),
    ).toThrow(/CHECK/);
    expect(() =>
      insert.run({
        ...inProgress,
        id: "note-12",
        sale_id: "sale-5",
        state: "ALREADY_CREDITED",
        answered_at: "2026-10-09T12:31:00.000Z",
      }),
    ).not.toThrow();
    expect(() =>
      insert.run({ ...inProgress, id: "note-13", sale_id: "sale-3", state: "ALREADY_CREDITED" }),
    ).toThrow(/CHECK/);
    expect(() =>
      insert.run({
        ...authorized,
        id: "note-14",
        sale_id: "sale-3",
        state: "ALREADY_CREDITED",
      }),
    ).toThrow(/CHECK/);
    database.close();
  });

  it("record the events replenished into a restored register, one row per event id", () => {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const path = join(folder, "register.sqlite");
      const previous = LOCAL_MIGRATIONS.filter(
        (migration) => migration.name < "0067_replenished_events",
      );
      expect(LOCAL_MIGRATIONS.map((migration) => migration.name)).toContain(
        "0067_replenished_events",
      );
      const before = openLocalDatabase(path, previous, migrationClock);
      before
        .prepare("UPDATE sync_state SET pull_cursor = 9, device_id = 'device-a' WHERE id = 1")
        .run();
      before.close();

      const after = openLocalDatabase(path, LOCAL_MIGRATIONS, migrationClock);

      expect(after.prepare("SELECT pull_cursor, device_id FROM sync_state").all()).toEqual([
        { pull_cursor: 9, device_id: "device-a" },
      ]);
      expect(after.prepare("SELECT * FROM replenished_events").all()).toEqual([]);
      const record = after.prepare("INSERT INTO replenished_events (event_id) VALUES (?)");
      expect(() => record.run("event-1")).not.toThrow();
      expect(() => record.run("event-1")).toThrow(/UNIQUE|PRIMARY KEY/);
      after.close();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("add the register's QR point of sale assignment, none for a register already holding data", () => {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const path = join(folder, "register.sqlite");
      const previous = LOCAL_MIGRATIONS.filter(
        (migration) => migration.name < "0066_register_qr_point_of_sale",
      );
      expect(LOCAL_MIGRATIONS.map((migration) => migration.name)).toContain(
        "0066_register_qr_point_of_sale",
      );
      const before = openLocalDatabase(path, previous, migrationClock);
      before.exec(
        "INSERT INTO own_register (id, name, version, removed) VALUES ('r1', 'Caja 1', 1, 0)",
      );
      before.close();

      const after = openLocalDatabase(path, LOCAL_MIGRATIONS, migrationClock);

      expect(
        after.prepare("SELECT count(*) AS total FROM register_qr_point_of_sale").get(),
      ).toEqual({ total: 0 });
      const assign = (assigned: number) =>
        after
          .prepare(
            "INSERT INTO register_qr_point_of_sale (register_id, assigned, version) VALUES ('r1', ?, 1)",
          )
          .run(assigned);
      expect(() => assign(2)).toThrow(/CHECK/);
      expect(() => assign(1)).not.toThrow();
      expect(() => assign(0)).toThrow(/UNIQUE|PRIMARY/);
      after.close();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("keep the reprints a register holds as receipt reprints and let a credit note number its own", () => {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const path = join(folder, "register.sqlite");
      const previous = LOCAL_MIGRATIONS.filter(
        (migration) => migration.name < "0071_credit_note_reprints",
      );
      expect(LOCAL_MIGRATIONS.map((migration) => migration.name)).toContain(
        "0071_credit_note_reprints",
      );
      const before = openLocalDatabase(path, previous, migrationClock);
      before.exec(
        `INSERT INTO own_register (id, name, version, removed) VALUES ('r1', 'Caja 1', 1, 0);
         INSERT INTO roles (id, name, is_administrator, version) VALUES ('cashier', 'Cajera', 0, 1);
         INSERT INTO users (id, first_name, role_id, salt, active, version) VALUES ('u1', 'Ada', 'cashier', 's', 1, 1);
         INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
         VALUES ('s1', 'r1', 'device-1', 'u1', '2026-09-30T12:00:00.000Z', 0, 'OPEN');
         INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at, operation_number)
         VALUES ('sale-1', 'r1', 'device-1', 's1', 'u1', 'COMPLETED', '2026-09-30T15:05:00.000Z', 1);
         INSERT INTO sale_reprints (sale_id, order_number, requested_by, authorized_by, reason_kind, reason_text, occurred_at)
         VALUES ('sale-1', 1, 'u1', 'u2', 'requested', 'Se mojo', '2026-09-30T15:10:00.000Z'),
                ('sale-1', 2, 'u1', NULL, 'retry', NULL, '2026-09-30T15:11:00.000Z');`,
      );
      before.close();

      const after = openLocalDatabase(path, LOCAL_MIGRATIONS, migrationClock);

      expect(
        after
          .prepare(
            "SELECT sale_id, document, order_number, requested_by, authorized_by, reason_kind, reason_text, occurred_at FROM sale_reprints ORDER BY order_number",
          )
          .all(),
      ).toEqual([
        {
          sale_id: "sale-1",
          document: "sale_receipt",
          order_number: 1,
          requested_by: "u1",
          authorized_by: "u2",
          reason_kind: "requested",
          reason_text: "Se mojo",
          occurred_at: "2026-09-30T15:10:00.000Z",
        },
        {
          sale_id: "sale-1",
          document: "sale_receipt",
          order_number: 2,
          requested_by: "u1",
          authorized_by: null,
          reason_kind: "retry",
          reason_text: null,
          occurred_at: "2026-09-30T15:11:00.000Z",
        },
      ]);
      const reprint = (document: string, orderNumber: number) =>
        after
          .prepare(
            `INSERT INTO sale_reprints (sale_id, document, order_number, requested_by, reason_kind, occurred_at)
             VALUES ('sale-1', ?, ?, 'u1', 'retry', '2026-09-30T15:12:00.000Z')`,
          )
          .run(document, orderNumber);
      expect(() => reprint("credit_note", 1)).not.toThrow();
      expect(() => reprint("credit_note", 1)).toThrow(/UNIQUE|PRIMARY KEY/);
      expect(() => reprint("sale_receipt", 2)).toThrow(/UNIQUE|PRIMARY KEY/);
      expect(() => reprint("invoice", 1)).toThrow(/CHECK/);
      expect(() => reprint("credit_note", 0)).toThrow(/CHECK/);
      expect(() =>
        after
          .prepare(
            `INSERT INTO sale_reprints (sale_id, document, order_number, requested_by, reason_kind, reason_text, occurred_at)
             VALUES ('sale-1', 'credit_note', 5, 'u1', 'retry', 'texto', '2026-09-30T15:12:00.000Z')`,
          )
          .run(),
      ).toThrow(/CHECK/);

      after.close();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("let an offline fiscal document record the lapse after a clock correction as its cause, keeping the documents a register already holds", () => {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const path = join(folder, "register.sqlite");
      const previous = LOCAL_MIGRATIONS.filter(
        (migration) => migration.name < "0068_clock_correction_lapse_cause",
      );
      expect(LOCAL_MIGRATIONS.map((migration) => migration.name)).toContain(
        "0068_clock_correction_lapse_cause",
      );
      const before = openLocalDatabase(path, previous, migrationClock);
      before.exec(
        `INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
         VALUES ('s1', 'r1', 'device-a', 'u1', '2026-10-09T12:00:00.000Z', 0, 'OPEN');
         INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at)
         VALUES ('kept', 'r1', 'device-a', 's1', 'u1', 'COMPLETED', '2026-10-09T12:05:00.000Z'),
                ('lapse', 'r1', 'device-a', 's1', 'u1', 'COMPLETED', '2026-10-09T12:06:00.000Z');
         INSERT INTO offline_fiscal_documents (
           id, sale_id, point_of_sale, document_type, number, issued_on, generated_at, generation_stamp,
           offline_authorization_code, fortnight_start, fortnight_end, document,
           buyer_document_type, buyer_document_number, cause
         ) VALUES (
           'offline-kept', 'kept', 31, 'factura_c', 1, '2026-10-09', '2026-10-09T12:05:00.000Z', '20261009090500',
           '36251478963214', '2026-10-01', '2026-10-15', '{}', 99, 0, 'unclear_outcome'
         );`,
      );
      before.close();

      const after = openLocalDatabase(path, LOCAL_MIGRATIONS, migrationClock);

      expect(after.prepare("SELECT id, number, cause FROM offline_fiscal_documents").all()).toEqual(
        [{ id: "offline-kept", number: 1, cause: "unclear_outcome" }],
      );
      const insert = after.prepare(
        `INSERT INTO offline_fiscal_documents (
           id, sale_id, point_of_sale, document_type, number, issued_on, generated_at, generation_stamp,
           offline_authorization_code, fortnight_start, fortnight_end, document,
           buyer_document_type, buyer_document_number, cause
         ) VALUES (
           'offline-lapse', 'lapse', 31, 'factura_c', 2, '2026-10-09', '2026-10-09T12:06:00.000Z', '20261009090600',
           '36251478963214', '2026-10-01', '2026-10-15', '{}', 99, 0, @cause
         )`,
      );
      expect(() => insert.run({ cause: "other" })).toThrow(/CHECK/);
      expect(() => insert.run({ cause: "clock_correction_lapse" })).not.toThrow();
      expect(() =>
        after
          .prepare("UPDATE offline_fiscal_documents SET number = 1 WHERE id = 'offline-lapse'")
          .run(),
      ).toThrow(/UNIQUE/);
      expect(after.pragma("foreign_key_check")).toEqual([]);
      after.close();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("add when the cloud first refused the register's sequence as stale, none for a register already holding data", () => {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const path = join(folder, "register.sqlite");
      const previous = LOCAL_MIGRATIONS.filter(
        (migration) => migration.name < "0070_stale_sequence",
      );
      expect(LOCAL_MIGRATIONS.map((migration) => migration.name)).toContain("0070_stale_sequence");
      const before = openLocalDatabase(path, previous, migrationClock);
      before
        .prepare("UPDATE sync_state SET pull_cursor = 9, device_id = 'device-a' WHERE id = 1")
        .run();
      before.close();

      const after = openLocalDatabase(path, LOCAL_MIGRATIONS, migrationClock);

      expect(
        after
          .prepare("SELECT pull_cursor, device_id, stale_sequence_detected_at FROM sync_state")
          .all(),
      ).toEqual([{ pull_cursor: 9, device_id: "device-a", stale_sequence_detected_at: null }]);
      after.close();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("add the points of sale a restored register awaits the numbering of, none for a register already holding data", () => {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const path = join(folder, "register.sqlite");
      const previous = LOCAL_MIGRATIONS.filter(
        (migration) => migration.name < "0072_awaiting_restored_numbering",
      );
      expect(LOCAL_MIGRATIONS.map((migration) => migration.name)).toContain(
        "0072_awaiting_restored_numbering",
      );
      const before = openLocalDatabase(path, previous, migrationClock);
      before.exec(
        `INSERT INTO own_register (id, name, version, removed) VALUES ('r1', 'Caja 1', 1, 0);
         INSERT INTO register_point_of_sale (register_id, point_of_sale_number, fiscal_address_id, version)
         VALUES ('r1', 12, 'address-1', 2);`,
      );
      before.close();

      const after = openLocalDatabase(path, LOCAL_MIGRATIONS, migrationClock);

      expect(after.prepare("SELECT register_id FROM register_point_of_sale").all()).toEqual([
        { register_id: "r1" },
      ]);
      expect(after.prepare("SELECT register_id FROM awaiting_restored_numbering").all()).toEqual(
        [],
      );
      after.close();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("hold the sale-voided event of a credit note a restored register must request, once per credit note and only for a credit note it holds, none for a register already holding credit notes", () => {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const path = join(folder, "register.sqlite");
      const previous = LOCAL_MIGRATIONS.filter(
        (migration) => migration.name < "0073_replenished_credit_note_requests",
      );
      expect(LOCAL_MIGRATIONS.map((migration) => migration.name)).toContain(
        "0073_replenished_credit_note_requests",
      );
      const before = openLocalDatabase(path, previous, migrationClock);
      before.exec(
        `INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
         VALUES ('s1', 'r1', 'device-a', 'u1', '2026-10-09T12:00:00.000Z', 0, 'OPEN');
         INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at)
         VALUES ('sale-1', 'r1', 'device-a', 's1', 'u1', 'COMPLETED', '2026-10-09T12:05:00.000Z');
         INSERT INTO sale_void_credit_notes (
           id, sale_id, total, receiver_tax_status_code, corrected_voucher_type,
           corrected_point_of_sale, corrected_number, state, recorded_at
         ) VALUES ('note-1', 'sale-1', 3000, 5, 11, 12, 41, 'IN_PROGRESS', '2026-10-09T12:30:00.000Z');`,
      );
      before.close();

      const after = openLocalDatabase(path, LOCAL_MIGRATIONS, migrationClock);

      expect(after.prepare("SELECT id FROM sale_credit_notes").all()).toEqual([{ id: "note-1" }]);
      expect(after.prepare("SELECT * FROM replenished_credit_note_requests").all()).toEqual([]);
      const hold = after.prepare(
        `INSERT INTO replenished_credit_note_requests (
           credit_note_id, event_id, device_seq, aggregate_type, aggregate_id, event_type,
           schema_version, payload, occurred_at, actor_id, chain_hmac
         ) VALUES (
           @credit_note_id, 'event-1', 53, 'Sale', 'sale-1', 'sale_voided', 3, '{}',
           '2026-10-09T12:20:00.000Z', 'u1', 'hmac'
         )`,
      );
      expect(() => hold.run({ credit_note_id: "note-1" })).not.toThrow();
      expect(() => hold.run({ credit_note_id: "note-1" })).toThrow(/UNIQUE|PRIMARY KEY/);
      expect(() => hold.run({ credit_note_id: "note-unknown" })).toThrow(/FOREIGN KEY/);
      after.close();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  describe("the deferred-sale backlog", () => {
    const MIGRATION = "0075_deferred_sale_backlog";

    function databaseHoldingDataBefore(path: string) {
      const previous = LOCAL_MIGRATIONS.filter((migration) => migration.name < MIGRATION);
      expect(LOCAL_MIGRATIONS.map((migration) => migration.name)).toContain(MIGRATION);
      const before = openLocalDatabase(path, previous, migrationClock);
      before.exec(
        `INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
         VALUES ('s1', 'r1', 'device-a', 'u1', '2026-10-09T12:00:00.000Z', 0, 'OPEN');
         INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at)
         VALUES ('sale-1', 'r1', 'device-a', 's1', 'u1', 'COMPLETED', '2026-10-09T12:05:00.000Z'),
                ('sale-2', 'r1', 'device-a', 's1', 'u1', 'COMPLETED', '2026-10-09T12:06:00.000Z'),
                ('sale-3', 'r1', 'device-a', 's1', 'u1', 'COMPLETED', '2026-10-09T12:07:00.000Z');
         INSERT INTO fiscal_documents (
           id, sale_id, point_of_sale, document_type, number, issued_on, document, state,
           authorization_code, authorization_code_due_on, reserved_at, resolved_at
         ) VALUES
           ('doc-1', 'sale-1', 12, 'factura_c', 41, '2026-10-09', '{}', 'AUTHORIZED',
            '75123456789012', '2026-10-19', '2026-10-09T12:05:00.000Z', '2026-10-09T12:05:01.000Z'),
           ('doc-2', 'sale-2', 12, 'factura_c', 42, '2026-10-09', '{}', 'REJECTED',
            NULL, NULL, '2026-10-09T12:06:00.000Z', '2026-10-09T12:06:01.000Z');
         INSERT INTO deferred_sales (
           id, sale_id, occurred_at, total, reason, short_code, routed_at,
           satisfied_by_fiscal_document_id, satisfied_at
         ) VALUES (
           'd1', 'sale-1', '2026-10-09T12:05:00.000Z', 1500, 'fiscally_offline', '7KQ4M2P9',
           '2026-10-09T12:05:01.000Z', 'doc-1', '2026-10-09T12:30:00.000Z'
         );
         INSERT INTO offline_fiscal_documents (
           id, sale_id, point_of_sale, document_type, number, issued_on, generated_at, generation_stamp,
           offline_authorization_code, fortnight_start, fortnight_end, document,
           buyer_document_type, buyer_document_number, cause
         ) VALUES (
           'offline-kept', 'sale-3', 31, 'factura_c', 1, '2026-10-09', '2026-10-09T12:07:00.000Z', '20261009090700',
           '36251478963214', '2026-10-01', '2026-10-15', '{}', 99, 0, 'unclear_outcome'
         );`,
      );
      before.close();
      return openLocalDatabase(path, LOCAL_MIGRATIONS, migrationClock);
    }

    function insertDocument(
      database: ReturnType<typeof openLocalDatabase>,
      values: { id: string; sale_id: string; number: number; state: string },
    ) {
      database
        .prepare(
          `INSERT INTO fiscal_documents (
             id, sale_id, point_of_sale, document_type, number, issued_on, document, state,
             authorization_code, authorization_code_due_on, reserved_at, resolved_at
           ) VALUES (
             @id, @sale_id, 12, 'factura_c', @number, '2026-10-09', '{}', @state,
             CASE WHEN @state = 'AUTHORIZED' THEN '75123456789012' END,
             CASE WHEN @state = 'AUTHORIZED' THEN '2026-10-19' END,
             '2026-10-09T12:06:00.000Z',
             CASE WHEN @state = 'REQUESTING' THEN NULL ELSE '2026-10-09T12:06:01.000Z' END
           )`,
        )
        .run(values);
    }

    it("keep the fiscal documents, deferred sales and offline documents a register already holds", () => {
      const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
      try {
        const after = databaseHoldingDataBefore(join(folder, "register.sqlite"));

        expect(
          after
            .prepare(
              "SELECT id, sale_id, number, state, authorization_code FROM fiscal_documents ORDER BY id",
            )
            .all(),
        ).toEqual([
          {
            id: "doc-1",
            sale_id: "sale-1",
            number: 41,
            state: "AUTHORIZED",
            authorization_code: "75123456789012",
          },
          {
            id: "doc-2",
            sale_id: "sale-2",
            number: 42,
            state: "REJECTED",
            authorization_code: null,
          },
        ]);
        expect(
          after.prepare("SELECT id, satisfied_by_fiscal_document_id FROM deferred_sales").all(),
        ).toEqual([{ id: "d1", satisfied_by_fiscal_document_id: "doc-1" }]);
        expect(after.prepare("SELECT id, cause FROM offline_fiscal_documents").all()).toEqual([
          { id: "offline-kept", cause: "unclear_outcome" },
        ]);
        expect(after.pragma("foreign_key_check")).toEqual([]);
        after.close();
      } finally {
        rmSync(folder, { recursive: true, force: true });
      }
    });

    it("let a sale hold a rejected, released or conflicting document beside one waiting or authorized", () => {
      const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
      try {
        const after = databaseHoldingDataBefore(join(folder, "register.sqlite"));

        expect(() =>
          insertDocument(after, {
            id: "doc-3",
            sale_id: "sale-2",
            number: 43,
            state: "REQUESTING",
          }),
        ).not.toThrow();
        expect(() =>
          insertDocument(after, { id: "doc-4", sale_id: "sale-2", number: 44, state: "RELEASED" }),
        ).not.toThrow();
        expect(() =>
          insertDocument(after, {
            id: "doc-5",
            sale_id: "sale-2",
            number: 45,
            state: "CONFLICTING",
          }),
        ).not.toThrow();
        expect(after.pragma("foreign_key_check")).toEqual([]);
        after.close();
      } finally {
        rmSync(folder, { recursive: true, force: true });
      }
    });

    it.each([
      ["a second waiting document", "REQUESTING", "UNKNOWN"],
      ["an authorized document beside a waiting one", "UNKNOWN", "AUTHORIZED"],
      ["a second authorized document", "AUTHORIZED", "AUTHORIZED"],
    ])("refuse %s for one sale", (_case, first, second) => {
      const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
      try {
        const after = databaseHoldingDataBefore(join(folder, "register.sqlite"));
        after.exec("DELETE FROM fiscal_documents WHERE id = 'doc-2'");

        insertDocument(after, { id: "doc-3", sale_id: "sale-2", number: 43, state: first });

        expect(() =>
          insertDocument(after, { id: "doc-4", sale_id: "sale-2", number: 44, state: second }),
        ).toThrow(/UNIQUE/);
        after.close();
      } finally {
        rmSync(folder, { recursive: true, force: true });
      }
    });

    it("keep one waiting document per point of sale and one use of each number", () => {
      const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
      try {
        const after = databaseHoldingDataBefore(join(folder, "register.sqlite"));

        insertDocument(after, { id: "doc-3", sale_id: "sale-2", number: 43, state: "REQUESTING" });

        expect(() =>
          insertDocument(after, {
            id: "doc-4",
            sale_id: "sale-3",
            number: 44,
            state: "REQUESTING",
          }),
        ).toThrow(/UNIQUE/);
        expect(() =>
          insertDocument(after, {
            id: "doc-5",
            sale_id: "sale-3",
            number: 41,
            state: "CONFLICTING",
          }),
        ).toThrow(/UNIQUE/);
        after.close();
      } finally {
        rmSync(folder, { recursive: true, force: true });
      }
    });

    it("keep satisfying a deferred sale only with an authorized document of its own sale", () => {
      const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
      try {
        const after = databaseHoldingDataBefore(join(folder, "register.sqlite"));
        after.exec(
          `INSERT INTO deferred_sales (id, sale_id, occurred_at, total, reason, short_code, routed_at)
           VALUES ('d2', 'sale-2', '2026-10-09T12:06:00.000Z', 900, 'rejected', '7KQ4M2PA', '2026-10-09T12:06:01.000Z')`,
        );

        expect(() =>
          after
            .prepare(
              "UPDATE deferred_sales SET satisfied_by_fiscal_document_id = 'doc-2', satisfied_at = '2026-10-09T12:40:00.000Z' WHERE id = 'd2'",
            )
            .run(),
        ).toThrow(/an authorized fiscal document of its own sale/);
        after.close();
      } finally {
        rmSync(folder, { recursive: true, force: true });
      }
    });

    it("let a sale be deferred, and a document be issued offline, because of the backlog", () => {
      const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
      try {
        const after = databaseHoldingDataBefore(join(folder, "register.sqlite"));

        const defer = after.prepare(
          `INSERT INTO deferred_sales (id, sale_id, occurred_at, total, reason, short_code, routed_at)
           VALUES ('d2', 'sale-2', '2026-10-09T12:06:00.000Z', 900, @reason, '7KQ4M2PA', '2026-10-09T12:06:01.000Z')`,
        );
        expect(() => defer.run({ reason: "forgotten" })).toThrow(/CHECK/);
        expect(() => defer.run({ reason: "deferred_backlog" })).not.toThrow();

        const issueOffline = after.prepare(
          `INSERT INTO offline_fiscal_documents (
             id, sale_id, point_of_sale, document_type, number, issued_on, generated_at, generation_stamp,
             offline_authorization_code, fortnight_start, fortnight_end, document,
             buyer_document_type, buyer_document_number, cause
           ) VALUES (
             'offline-backlog', 'sale-2', 31, 'factura_c', 2, '2026-10-09', '2026-10-09T12:06:00.000Z', '20261009090600',
             '36251478963214', '2026-10-01', '2026-10-15', '{}', 99, 0, @cause
           )`,
        );
        expect(() => issueOffline.run({ cause: "other" })).toThrow(/CHECK/);
        expect(() => issueOffline.run({ cause: "deferred_backlog" })).not.toThrow();
        after.close();
      } finally {
        rmSync(folder, { recursive: true, force: true });
      }
    });
  });
});

describe("the orphan sweep migration", () => {
  it("leaves a register that already holds data awaiting no sweep", () => {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const path = join(folder, "register.sqlite");
      const previous = LOCAL_MIGRATIONS.filter(
        (migration) => migration.name < "0074_awaiting_orphan_sweep",
      );
      expect(LOCAL_MIGRATIONS.map((migration) => migration.name)).toContain(
        "0074_awaiting_orphan_sweep",
      );
      const before = openLocalDatabase(path, previous, migrationClock);
      before.exec(
        `INSERT INTO own_register (id, name, version, removed) VALUES ('r1', 'Caja 1', 1, 0);
         INSERT INTO register_point_of_sale (register_id, point_of_sale_number, fiscal_address_id, version)
         VALUES ('r1', 12, 'address-1', 2);`,
      );
      before.close();

      const after = openLocalDatabase(path, LOCAL_MIGRATIONS, migrationClock);

      expect(after.prepare("SELECT register_id FROM awaiting_orphan_sweep").all()).toEqual([]);
      after.close();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });
});

describe("the deferred sale invoice prints migration", () => {
  const MIGRATION = "0080_deferred_sale_invoice_prints";

  it("keeps the reprints a register holds and lets a deferred sale's invoice number its own", () => {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const path = join(folder, "register.sqlite");
      const previous = LOCAL_MIGRATIONS.filter((migration) => migration.name < MIGRATION);
      expect(LOCAL_MIGRATIONS.map((migration) => migration.name)).toContain(MIGRATION);
      const before = openLocalDatabase(path, previous, migrationClock);
      before.exec(
        `INSERT INTO own_register (id, name, version, removed) VALUES ('r1', 'Caja 1', 1, 0);
         INSERT INTO roles (id, name, is_administrator, version) VALUES ('cashier', 'Cajera', 0, 1);
         INSERT INTO users (id, first_name, role_id, salt, active, version) VALUES ('u1', 'Ada', 'cashier', 's', 1, 1);
         INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
         VALUES ('s1', 'r1', 'device-1', 'u1', '2026-09-30T12:00:00.000Z', 0, 'OPEN');
         INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at, operation_number)
         VALUES ('sale-1', 'r1', 'device-1', 's1', 'u1', 'COMPLETED', '2026-09-30T15:05:00.000Z', 1);
         INSERT INTO sale_reprints (sale_id, document, order_number, requested_by, authorized_by, reason_kind, reason_text, occurred_at)
         VALUES ('sale-1', 'sale_receipt', 1, 'u1', 'u2', 'requested', 'Se mojo', '2026-09-30T15:10:00.000Z'),
                ('sale-1', 'credit_note', 1, 'u1', NULL, 'retry', NULL, '2026-09-30T15:11:00.000Z');`,
      );
      before.close();

      const after = openLocalDatabase(path, LOCAL_MIGRATIONS, migrationClock);

      expect(
        after
          .prepare(
            "SELECT sale_id, document, order_number, requested_by, authorized_by, reason_kind, reason_text, occurred_at FROM sale_reprints ORDER BY document",
          )
          .all(),
      ).toEqual([
        {
          sale_id: "sale-1",
          document: "credit_note",
          order_number: 1,
          requested_by: "u1",
          authorized_by: null,
          reason_kind: "retry",
          reason_text: null,
          occurred_at: "2026-09-30T15:11:00.000Z",
        },
        {
          sale_id: "sale-1",
          document: "sale_receipt",
          order_number: 1,
          requested_by: "u1",
          authorized_by: "u2",
          reason_kind: "requested",
          reason_text: "Se mojo",
          occurred_at: "2026-09-30T15:10:00.000Z",
        },
      ]);
      const reprint = (document: string, orderNumber: number) =>
        after
          .prepare(
            `INSERT INTO sale_reprints (sale_id, document, order_number, requested_by, reason_kind, occurred_at)
             VALUES ('sale-1', ?, ?, 'u1', 'retry', '2026-09-30T15:12:00.000Z')`,
          )
          .run(document, orderNumber);
      expect(() => reprint("deferred_invoice", 1)).not.toThrow();
      expect(() => reprint("deferred_invoice", 1)).toThrow(/UNIQUE|PRIMARY KEY/);
      expect(() => reprint("invoice", 1)).toThrow(/CHECK/);
      expect(() => reprint("deferred_invoice", 0)).toThrow(/CHECK/);

      const attempt = (saleId: string) =>
        after
          .prepare(
            "INSERT INTO deferred_invoice_prints (sale_id, print_attempted_at, printed_at) VALUES (?, '2026-09-30T16:00:00.000Z', NULL)",
          )
          .run(saleId);
      expect(() => attempt("sale-1")).not.toThrow();
      expect(() => attempt("sale-1")).toThrow(/UNIQUE|PRIMARY KEY/);
      expect(() => attempt("missing")).toThrow(/FOREIGN KEY/);
      const receipt = () =>
        after
          .prepare(
            "INSERT INTO deferred_invoice_receipts (sale_id, template_version, head, body) VALUES ('sale-1', '1', x'00', x'01')",
          )
          .run();
      expect(receipt).not.toThrow();
      expect(receipt).toThrow(/UNIQUE|PRIMARY KEY/);
      after.close();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });
});

describe("the contingency backup tickets migration", () => {
  const ticket = {
    id: "ticket-1",
    operation: "sale",
    subject_id: "sale-1",
    first_device_seq: 4,
    last_device_seq: 6,
    created_at: "2026-10-09T12:00:00.000Z",
    key_version: 1,
    qr_codes: '["AB"]',
  };
  const insertTicket = `INSERT INTO contingency_backup_tickets (
       id, operation, subject_id, first_device_seq, last_device_seq, created_at, key_version, qr_codes
     ) VALUES (
       @id, @operation, @subject_id, @first_device_seq, @last_device_seq, @created_at, @key_version, @qr_codes
     )`;

  it("adds the tickets table, empty, to a register that already holds data", () => {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const path = join(folder, "register.sqlite");
      const previous = LOCAL_MIGRATIONS.filter(
        (migration) => migration.name < "0077_contingency_backup_tickets",
      );
      const before = openLocalDatabase(path, previous, migrationClock);
      before.prepare("UPDATE sync_state SET pull_cursor = 7 WHERE id = 1").run();
      before.close();

      const after = openLocalDatabase(path, LOCAL_MIGRATIONS, migrationClock);

      expect(after.prepare("SELECT pull_cursor FROM sync_state").all()).toEqual([
        { pull_cursor: 7 },
      ]);
      expect(after.prepare("SELECT id FROM contingency_backup_tickets").all()).toEqual([]);
      after.close();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("accepts a ticket of every operation of the domain and refuses any other", () => {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const database = openLocalDatabase(
        join(folder, "register.sqlite"),
        LOCAL_MIGRATIONS,
        migrationClock,
      );
      const insert = database.prepare(insertTicket);

      for (const [index, operation] of CONTINGENCY_BACKUP_OPERATIONS.entries()) {
        expect(() => insert.run({ ...ticket, id: `ticket-${index}`, operation })).not.toThrow();
      }
      expect(() => insert.run({ ...ticket, id: "other", operation: "refund" })).toThrow(/CHECK/);
      database.close();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("holds a ticket without subject, without key and not printed, and one printed and discarded", () => {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const database = openLocalDatabase(
        join(folder, "register.sqlite"),
        LOCAL_MIGRATIONS,
        migrationClock,
      );

      database
        .prepare(insertTicket)
        .run({ ...ticket, subject_id: null, key_version: null, qr_codes: null });
      database.prepare(insertTicket).run({ ...ticket, id: "ticket-2" });
      database
        .prepare(
          `UPDATE contingency_backup_tickets
              SET printed_at = '2026-10-09T12:01:00.000Z', discarded_at = '2026-10-10T12:00:00.000Z'
            WHERE id = 'ticket-2'`,
        )
        .run();

      expect(
        database
          .prepare(
            "SELECT id, printed_at, discarded_at FROM contingency_backup_tickets ORDER BY id",
          )
          .all(),
      ).toEqual([
        { id: "ticket-1", printed_at: null, discarded_at: null },
        {
          id: "ticket-2",
          printed_at: "2026-10-09T12:01:00.000Z",
          discarded_at: "2026-10-10T12:00:00.000Z",
        },
      ]);
      database.close();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("refuses a key version without its QR codes, and QR codes without their key version", () => {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const database = openLocalDatabase(
        join(folder, "register.sqlite"),
        LOCAL_MIGRATIONS,
        migrationClock,
      );
      const insert = database.prepare(insertTicket);

      expect(() => insert.run({ ...ticket, qr_codes: null })).toThrow(/CHECK/);
      expect(() => insert.run({ ...ticket, key_version: null })).toThrow(/CHECK/);
      database.close();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("refuses a ticket whose last event comes before its first", () => {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const database = openLocalDatabase(
        join(folder, "register.sqlite"),
        LOCAL_MIGRATIONS,
        migrationClock,
      );

      expect(() =>
        database.prepare(insertTicket).run({ ...ticket, first_device_seq: 7, last_device_seq: 6 }),
      ).toThrow(/CHECK/);
      database.close();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });
});

describe("the offline void credit notes migration", () => {
  const MIGRATION = "0078_offline_void_credit_notes";

  function databaseHoldingDataBefore(path: string) {
    const previous = LOCAL_MIGRATIONS.filter((migration) => migration.name < MIGRATION);
    expect(LOCAL_MIGRATIONS.map((migration) => migration.name)).toContain(MIGRATION);
    const before = openLocalDatabase(path, previous, migrationClock);
    before.exec(
      `INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
       VALUES ('s1', 'r1', 'device-a', 'u1', '2026-10-09T12:00:00.000Z', 0, 'OPEN');
       INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at)
       VALUES ('sale-1', 'r1', 'device-a', 's1', 'u1', 'COMPLETED', '2026-10-09T12:05:00.000Z'),
              ('sale-2', 'r1', 'device-a', 's1', 'u1', 'COMPLETED', '2026-10-09T12:06:00.000Z'),
              ('sale-3', 'r1', 'device-a', 's1', 'u1', 'COMPLETED', '2026-10-09T12:07:00.000Z');
       INSERT INTO register_offline_point_of_sale (
         register_id, point_of_sale_number, tax_authority_last_authorized_number,
         highest_synced_offline_number, version
       ) VALUES ('r1', 31, 1000, 1004, 2);
       INSERT INTO offline_number_blocks (id, point_of_sale, document_type, first_number, last_number, status, version)
       VALUES ('b1', 31, 'factura_c', 1001, 2000, 'in_use', 3);
       INSERT INTO register_clock_marks (point_of_sale, document_type, reading)
       VALUES (31, 'factura_c', '2026-10-09T12:07:00.000Z');
       INSERT INTO offline_fiscal_documents (
         id, sale_id, point_of_sale, document_type, number, issued_on, generated_at, generation_stamp,
         offline_authorization_code, fortnight_start, fortnight_end, document,
         buyer_document_type, buyer_document_number, cause
       ) VALUES (
         'offline-kept', 'sale-1', 31, 'factura_c', 1001, '2026-10-09', '2026-10-09T12:05:00.000Z', '20261009090500',
         '36251478963214', '2026-10-01', '2026-10-15', '{}', 99, 0, 'no_connectivity'
       );
       INSERT INTO sale_void_credit_notes (
         id, sale_id, total, receiver_tax_status_code, corrected_voucher_type,
         corrected_point_of_sale, corrected_number, state, recorded_at
       ) VALUES ('note-kept', 'sale-1', 3000, 5, 11, 31, 1001, 'IN_PROGRESS', '2026-10-09T12:30:00.000Z');
       INSERT INTO replenished_credit_note_requests (
         credit_note_id, event_id, device_seq, aggregate_type, aggregate_id, event_type,
         schema_version, payload, occurred_at, actor_id, chain_hmac
       ) VALUES (
         'note-kept', 'event-1', 7, 'Sale', 'sale-1', 'sale_voided', 3, '{}',
         '2026-10-09T12:30:00.000Z', 'u1', 'hmac-1'
       );`,
    );
    before.close();
    return openLocalDatabase(path, LOCAL_MIGRATIONS, migrationClock);
  }

  function withDatabase(test: (database: ReturnType<typeof openLocalDatabase>) => void) {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const after = databaseHoldingDataBefore(join(folder, "register.sqlite"));
      try {
        test(after);
      } finally {
        after.close();
      }
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  }

  const offlineDocument = {
    id: "offline-note",
    sale_id: "sale-1",
    point_of_sale: 31,
    document_type: "credit_note_c",
    number: 1,
    credit_note_id: "note-kept",
    corrected_voucher_type: 11,
    corrected_point_of_sale: 31,
    corrected_number: 1001,
  };

  function insertOfflineDocument(
    database: ReturnType<typeof openLocalDatabase>,
    values: Partial<typeof offlineDocument>,
  ) {
    database
      .prepare(
        `INSERT INTO offline_fiscal_documents (
           id, sale_id, point_of_sale, document_type, number, issued_on, generated_at, generation_stamp,
           offline_authorization_code, fortnight_start, fortnight_end, document,
           buyer_document_type, buyer_document_number, cause,
           credit_note_id, corrected_voucher_type, corrected_point_of_sale, corrected_number
         ) VALUES (
           @id, @sale_id, @point_of_sale, @document_type, @number, '2026-10-09', '2026-10-09T12:40:00.000Z', '20261009094000',
           '36251478963214', '2026-10-01', '2026-10-15', '{}', 99, 0, 'no_connectivity',
           @credit_note_id, @corrected_voucher_type, @corrected_point_of_sale, @corrected_number
         )`,
      )
      .run({ ...offlineDocument, ...values });
  }

  it("keep the offline documents, credit notes, counts, blocks and marks a register already holds", () => {
    withDatabase((after) => {
      expect(
        after.prepare("SELECT id, document_type, number FROM offline_fiscal_documents").all(),
      ).toEqual([{ id: "offline-kept", document_type: "factura_c", number: 1001 }]);
      expect(after.prepare("SELECT id, state FROM sale_credit_notes").all()).toEqual([
        { id: "note-kept", state: "IN_PROGRESS" },
      ]);
      expect(
        after
          .prepare(
            "SELECT point_of_sale, document_type, tax_authority_last_authorized_number, highest_synced_offline_number FROM offline_series_counts",
          )
          .all(),
      ).toEqual([
        {
          point_of_sale: 31,
          document_type: "factura_c",
          tax_authority_last_authorized_number: 1000,
          highest_synced_offline_number: 1004,
        },
      ]);
      expect(
        after
          .prepare(
            "SELECT register_id, point_of_sale_number, version FROM register_offline_point_of_sale",
          )
          .all(),
      ).toEqual([{ register_id: "r1", point_of_sale_number: 31, version: 2 }]);
      expect(after.prepare("SELECT id, document_type FROM offline_number_blocks").all()).toEqual([
        { id: "b1", document_type: "factura_c" },
      ]);
      expect(
        after.prepare("SELECT point_of_sale, document_type FROM register_clock_marks").all(),
      ).toEqual([{ point_of_sale: 31, document_type: "factura_c" }]);
      expect(
        after
          .prepare("SELECT credit_note_id, event_id FROM replenished_credit_note_requests")
          .all(),
      ).toEqual([{ credit_note_id: "note-kept", event_id: "event-1" }]);
      expect(after.pragma("foreign_key_check")).toEqual([]);
    });
  });

  it("hold a credit note C beside the factura of its sale, once per sale", () => {
    withDatabase((after) => {
      expect(() => insertOfflineDocument(after, {})).not.toThrow();
      expect(() => insertOfflineDocument(after, { id: "offline-note-2", number: 2 })).toThrow(
        /UNIQUE/,
      );
      expect(() =>
        insertOfflineDocument(after, {
          id: "offline-factura-again",
          document_type: "factura_c",
          number: 1002,
          credit_note_id: null as never,
          corrected_voucher_type: null as never,
          corrected_point_of_sale: null as never,
          corrected_number: null as never,
        }),
      ).toThrow(/UNIQUE/);
    });
  });

  it("number a credit note C in a series of its own", () => {
    withDatabase((after) => {
      insertOfflineDocument(after, { number: 1001 });

      expect(() =>
        insertOfflineDocument(after, { id: "offline-note-2", sale_id: "sale-2", number: 1001 }),
      ).toThrow(/UNIQUE/);
    });
  });

  it.each([
    ["without the voucher it corrects", { corrected_number: null as never }],
    ["without its credit note", { credit_note_id: null as never }],
    ["of another document type", { document_type: "nota_a" }],
  ])("refuse an offline credit note %s", (_case, values) => {
    withDatabase((after) => {
      expect(() => insertOfflineDocument(after, values)).toThrow(/CHECK|NOT NULL/);
    });
  });

  it("refuse a factura that names a voucher it corrects", () => {
    withDatabase((after) => {
      expect(() =>
        insertOfflineDocument(after, {
          id: "offline-factura",
          sale_id: "sale-2",
          document_type: "factura_c",
          number: 1002,
        }),
      ).toThrow(/CHECK/);
    });
  });

  it("let a number block and a clock mark belong to the credit note series", () => {
    withDatabase((after) => {
      expect(() =>
        after
          .prepare(
            `INSERT INTO offline_number_blocks (id, point_of_sale, document_type, first_number, last_number, status, version)
             VALUES ('b2', 31, 'credit_note_c', 1, 1000, 'in_use', 1)`,
          )
          .run(),
      ).not.toThrow();
      expect(() =>
        after
          .prepare(
            `INSERT INTO register_clock_marks (point_of_sale, document_type, reading)
             VALUES (31, 'credit_note_c', '2026-10-09T12:40:00.000Z')`,
          )
          .run(),
      ).not.toThrow();
      expect(() =>
        after
          .prepare(
            `INSERT INTO offline_number_blocks (id, point_of_sale, document_type, first_number, last_number, status, version)
             VALUES ('b3', 31, 'nota_a', 1, 1000, 'in_use', 1)`,
          )
          .run(),
      ).toThrow(/CHECK/);
    });
  });

  it("hold the tax authority's count and the highest synced number of each series, once per point of sale", () => {
    withDatabase((after) => {
      const insert = after.prepare(
        `INSERT INTO offline_series_counts (
           point_of_sale, document_type, tax_authority_last_authorized_number, highest_synced_offline_number
         ) VALUES (@point_of_sale, @document_type, 40, NULL)`,
      );

      expect(() => insert.run({ point_of_sale: 31, document_type: "credit_note_c" })).not.toThrow();
      expect(() => insert.run({ point_of_sale: 31, document_type: "credit_note_c" })).toThrow(
        /UNIQUE|PRIMARY KEY/,
      );
      expect(() => insert.run({ point_of_sale: 31, document_type: "factura_c" })).toThrow(
        /UNIQUE|PRIMARY KEY/,
      );
      expect(() => insert.run({ point_of_sale: 32, document_type: "factura_c" })).not.toThrow();
      expect(() => insert.run({ point_of_sale: 31, document_type: "nota_a" })).toThrow(/CHECK/);
    });
  });

  it("no longer keep the counts in the register's offline point of sale", () => {
    withDatabase((after) => {
      const columns = after
        .prepare<[], { name: string }>(
          "SELECT name FROM pragma_table_info('register_offline_point_of_sale')",
        )
        .all()
        .map((column) => column.name);

      expect(columns).not.toContain("tax_authority_last_authorized_number");
      expect(columns).not.toContain("highest_synced_offline_number");
    });
  });

  it("declare the offline point of sale for redelivery from its first change, so the credit note counts arrive, leaving the pull cursor as it is", () => {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const path = join(folder, "register.sqlite");
      const previous = LOCAL_MIGRATIONS.filter((migration) => migration.name < MIGRATION);
      const before = openLocalDatabase(path, previous, migrationClock);
      before.exec(
        `UPDATE sync_state SET pull_cursor = 9, device_id = 'device-a' WHERE id = 1;
         UPDATE pulled_table_redeliveries SET cursor = 7
         WHERE table_name = 'register_offline_point_of_sale';`,
      );
      before.close();

      const after = openLocalDatabase(path, LOCAL_MIGRATIONS, migrationClock);

      expect(
        after
          .prepare("SELECT table_name, cursor FROM pulled_table_redeliveries ORDER BY table_name")
          .all(),
      ).toContainEqual({ table_name: "register_offline_point_of_sale", cursor: 0 });
      expect(after.prepare("SELECT pull_cursor FROM sync_state").all()).toEqual([
        { pull_cursor: 9 },
      ]);
      after.close();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it.each([
    ["a count and no synced number", "1000, NULL", { count: 1000, highest: null }],
    ["a synced number and no count", "NULL, 1004", { count: null, highest: 1004 }],
  ])("keep the factura counts of an offline point of sale holding %s", (_case, values, kept) => {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const path = join(folder, "register.sqlite");
      const previous = LOCAL_MIGRATIONS.filter((migration) => migration.name < MIGRATION);
      const before = openLocalDatabase(path, previous, migrationClock);
      before.exec(
        `INSERT INTO register_offline_point_of_sale (
           register_id, point_of_sale_number, tax_authority_last_authorized_number,
           highest_synced_offline_number, version
         ) VALUES ('r1', 31, ${values}, 2);`,
      );
      before.close();

      const after = openLocalDatabase(path, LOCAL_MIGRATIONS, migrationClock);

      expect(
        after
          .prepare(
            "SELECT tax_authority_last_authorized_number AS count, highest_synced_offline_number AS highest FROM offline_series_counts WHERE point_of_sale = 31 AND document_type = 'factura_c'",
          )
          .all(),
      ).toEqual([kept]);
      after.close();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("keep no count for an offline point of sale that held none", () => {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const path = join(folder, "register.sqlite");
      const previous = LOCAL_MIGRATIONS.filter((migration) => migration.name < MIGRATION);
      const before = openLocalDatabase(path, previous, migrationClock);
      before.exec(
        `INSERT INTO register_offline_point_of_sale (register_id, point_of_sale_number, version)
         VALUES ('r1', 31, 2);`,
      );
      before.close();

      const after = openLocalDatabase(path, LOCAL_MIGRATIONS, migrationClock);

      expect(after.prepare("SELECT * FROM offline_series_counts").all()).toEqual([]);
      after.close();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  describe("a credit note issued offline", () => {
    function issue(
      database: ReturnType<typeof openLocalDatabase>,
      values: { document_id: string | null; answered_at: string | null; code?: string | null },
    ) {
      database
        .prepare(
          `INSERT INTO sale_credit_notes (
             id, sale_id, total, receiver_tax_status_code, corrected_voucher_type,
             corrected_point_of_sale, corrected_number, state, authorization_code,
             recorded_at, answered_at, offline_fiscal_document_id
           ) VALUES (
             'note-2', 'sale-2', 3000, 5, 11, 31, 1002, 'ISSUED_OFFLINE', @code,
             '2026-10-09T12:40:00.000Z', @answered_at, @document_id
           )`,
        )
        .run({ code: null, ...values });
    }

    it("is answered by the offline document that carries its number", () => {
      withDatabase((after) => {
        insertOfflineDocument(after, {
          id: "offline-note-2",
          sale_id: "sale-2",
          credit_note_id: "note-2",
        });

        expect(() =>
          issue(after, { document_id: "offline-note-2", answered_at: "2026-10-09T12:40:00.000Z" }),
        ).not.toThrow();
        expect(after.pragma("foreign_key_check")).toEqual([]);
      });
    });

    it.each([
      [
        "without its offline document",
        { document_id: null, answered_at: "2026-10-09T12:40:00.000Z" },
      ],
      ["without an answer moment", { document_id: "offline-note-2", answered_at: null }],
      [
        "with an authorization code of the tax authority",
        {
          document_id: "offline-note-2",
          answered_at: "2026-10-09T12:40:00.000Z",
          code: "75123456789012",
        },
      ],
    ])("is refused %s", (_case, values) => {
      withDatabase((after) => {
        insertOfflineDocument(after, {
          id: "offline-note-2",
          sale_id: "sale-2",
          credit_note_id: "note-2",
        });

        expect(() => issue(after, values)).toThrow(/CHECK/);
      });
    });

    it("is refused when no offline document of the register has the id", () => {
      withDatabase((after) => {
        expect(() =>
          issue(after, { document_id: "missing", answered_at: "2026-10-09T12:40:00.000Z" }),
        ).toThrow(/FOREIGN KEY/);
      });
    });

    it("leaves the other states as they were", () => {
      withDatabase((after) => {
        expect(() =>
          after
            .prepare(
              `INSERT INTO sale_credit_notes (
                 id, sale_id, total, receiver_tax_status_code, corrected_voucher_type,
                 corrected_point_of_sale, corrected_number, state, recorded_at, offline_fiscal_document_id
               ) VALUES ('note-3', 'sale-3', 3000, 5, 11, 31, 1003, 'IN_PROGRESS', '2026-10-09T12:41:00.000Z', 'offline-kept')`,
            )
            .run(),
        ).toThrow(/CHECK/);
      });
    });
  });
});

describe("the replenishment failure migration", () => {
  const MIGRATION = "0079_replenishment_failure";

  function withDatabase(test: (database: ReturnType<typeof openLocalDatabase>) => void) {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const previous = LOCAL_MIGRATIONS.filter((migration) => migration.name < MIGRATION);
      expect(LOCAL_MIGRATIONS.map((migration) => migration.name)).toContain(MIGRATION);
      const path = join(folder, "register.sqlite");
      const before = openLocalDatabase(path, previous, migrationClock);
      before.exec(
        "INSERT INTO register_predecessor (device_id, last_acknowledged_seq) VALUES ('device-old', 52)",
      );
      before.close();
      const after = openLocalDatabase(path, LOCAL_MIGRATIONS, migrationClock);
      try {
        test(after);
      } finally {
        after.close();
      }
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  }

  it("keeps a predecessor held before it, with no failure", () => {
    withDatabase((database) => {
      expect(database.prepare("SELECT * FROM register_predecessor").all()).toEqual([
        {
          device_id: "device-old",
          last_acknowledged_seq: 52,
          failure_kind: null,
          failure_refusal: null,
          failure_event_id: null,
          failure_reason: null,
          failure_app_version: null,
        },
      ]);
    });
  });

  it.each([
    [
      "a kind of failure the register does not know",
      "UPDATE register_predecessor SET failure_kind = 'lost'",
    ],
    ["a refusal with no refusal named", "UPDATE register_predecessor SET failure_kind = 'refused'"],
    [
      "an unreadable event with no event named",
      "UPDATE register_predecessor SET failure_kind = 'unreadable_event', failure_reason = 'garbled'",
    ],
    [
      "a refusal the cloud does not give",
      "UPDATE register_predecessor SET failure_kind = 'refused', failure_refusal = 'because'",
    ],
    [
      "a refusal that also names an event",
      "UPDATE register_predecessor SET failure_kind = 'refused', failure_refusal = 'predecessor_not_revoked', failure_event_id = 'event-1', failure_reason = 'garbled'",
    ],
    [
      "details of a failure with no kind",
      "UPDATE register_predecessor SET failure_reason = 'garbled'",
    ],
  ])("refuses %s", (_name, statement) => {
    withDatabase((database) => {
      expect(() => database.exec(statement)).toThrow(/CHECK/);
    });
  });

  it.each([
    "UPDATE register_predecessor SET failure_kind = 'refused', failure_refusal = 'predecessor_not_of_register'",
    "UPDATE register_predecessor SET failure_kind = 'unreadable_event', failure_event_id = 'event-1', failure_reason = 'garbled', failure_app_version = '1.4.0'",
    "UPDATE register_predecessor SET failure_kind = 'unreadable_event', failure_event_id = 'event-1', failure_reason = 'garbled'",
  ])("accepts a failure written as %s", (statement) => {
    withDatabase((database) => {
      expect(() => database.exec(statement)).not.toThrow();
    });
  });
});

describe("the zone rules migration", () => {
  function withDatabase(test: (database: ReturnType<typeof openLocalDatabase>) => void) {
    const database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
    try {
      test(database);
    } finally {
      database.close();
    }
  }

  it("starts with no zone rules, so the register applies the fixed rules until its first delivery", () => {
    withDatabase((database) => {
      expect(database.prepare("SELECT version FROM zone_rules").all()).toEqual([]);
    });
  });

  it("keeps the transitions and publication number of each version", () => {
    withDatabase((database) => {
      database
        .prepare(
          "INSERT INTO zone_rules (version, transitions, publication_number) VALUES (?, ?, ?)",
        )
        .run("2026a", "[]", 1);

      expect(
        database.prepare("SELECT version, transitions, publication_number FROM zone_rules").all(),
      ).toEqual([{ version: "2026a", transitions: "[]", publication_number: 1 }]);
    });
  });

  it("keeps two publications of one version", () => {
    withDatabase((database) => {
      const insert = database.prepare(
        "INSERT INTO zone_rules (version, transitions, publication_number) VALUES ('2026a', '[]', ?)",
      );
      insert.run(1);
      insert.run(3);

      expect(
        database
          .prepare("SELECT version, publication_number FROM zone_rules ORDER BY publication_number")
          .all(),
      ).toEqual([
        { version: "2026a", publication_number: 1 },
        { version: "2026a", publication_number: 3 },
      ]);
    });
  });

  it("refuses two rows of one publication number", () => {
    withDatabase((database) => {
      const insert = database.prepare(
        "INSERT INTO zone_rules (version, transitions, publication_number) VALUES (?, '[]', 1)",
      );
      insert.run("2026a");

      expect(() => insert.run("2026b")).toThrow(/UNIQUE|PRIMARY/);
    });
  });
});

describe("the sale returns migration", () => {
  const MIGRATION = "0082_sale_returns";

  type Database = ReturnType<typeof openLocalDatabase>;

  function withHeldSale(test: (database: Database) => void) {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const path = join(folder, "register.sqlite");
      const previous = LOCAL_MIGRATIONS.filter((migration) => migration.name < MIGRATION);
      expect(LOCAL_MIGRATIONS.map((migration) => migration.name)).toContain(MIGRATION);
      const before = openLocalDatabase(path, previous, migrationClock);
      before.exec(
        `INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
         VALUES ('s1', 'r1', 'device-a', 'u1', '2026-10-09T12:00:00.000Z', 0, 'OPEN');
         INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at)
         VALUES ('sale-1', 'r1', 'device-a', 's1', 'u1', 'COMPLETED', '2026-10-09T12:05:00.000Z');
         INSERT INTO sale_lines (id, sale_id, position, product_id, product_name, quantity, list_unit_price, price_list_id, line_total)
         VALUES ('line-1', 'sale-1', 1, 'p1', 'Yerba', 2, 1500, 'list-1', 3000);
         INSERT INTO stock_movements (id, product_id, kind, sale_line_id, delta, occurred_at)
         VALUES ('movement-1', 'p1', 'sale', 'line-1', -2, '2026-10-09T12:05:00.000Z'),
                ('movement-2', 'p1', 'loss', NULL, -1, '2026-10-09T12:07:00.000Z');`,
      );
      before.close();
      const after = openLocalDatabase(path, LOCAL_MIGRATIONS, migrationClock);
      try {
        test(after);
      } finally {
        after.close();
      }
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  }

  function insertReturn(
    database: Database,
    fields: {
      id: string;
      saleId?: string;
      sessionId?: string;
      authorizedBy?: string;
      source?: string;
    },
  ) {
    return database
      .prepare(
        `INSERT INTO returns (id, sale_id, register_id, device_id, session_id, actor_id, authorized_by, ticket_source, occurred_at)
         VALUES (@id, @sale_id, 'r1', 'device-a', @session_id, 'u1', @authorized_by, @ticket_source, '2026-10-12T12:00:00.000Z')`,
      )
      .run({
        id: fields.id,
        sale_id: fields.saleId ?? "sale-1",
        session_id: fields.sessionId ?? "s1",
        authorized_by: fields.authorizedBy ?? null,
        ticket_source: fields.source ?? "QR",
      });
  }

  function insertLine(database: Database, values: Record<string, string | number>) {
    return database
      .prepare(
        `INSERT INTO return_lines (return_id, sale_line_id, quantity, reason, disposition, refunded_amount)
         VALUES (@return_id, @sale_line_id, @quantity, @reason, @disposition, @refunded_amount)`,
      )
      .run({
        return_id: "return-1",
        sale_line_id: "line-1",
        quantity: 1,
        reason: "change_of_mind",
        disposition: "restock",
        refunded_amount: 1500,
        ...values,
      });
  }

  it("keeps the stock movements a register already holds", () => {
    withHeldSale((database) => {
      expect(
        database
          .prepare("SELECT id, kind, sale_line_id, delta FROM stock_movements ORDER BY id")
          .all(),
      ).toEqual([
        { id: "movement-1", kind: "sale", sale_line_id: "line-1", delta: -2 },
        { id: "movement-2", kind: "loss", sale_line_id: null, delta: -1 },
      ]);
      expect(database.pragma("foreign_key_check")).toEqual([]);
      expect(
        database
          .prepare("SELECT name FROM sqlite_schema WHERE name = 'stock_movements_by_product'")
          .all(),
      ).toHaveLength(1);
    });
  });

  it("lets a stock movement give back what a sale line took as a return, and refuses a line on a loss", () => {
    withHeldSale((database) => {
      const record = (id: string, kind: string, saleLineId: string | null) =>
        database
          .prepare(
            `INSERT INTO stock_movements (id, product_id, kind, sale_line_id, delta, occurred_at)
             VALUES (@id, 'p1', @kind, @sale_line_id, 1, '2026-10-12T12:00:00.000Z')`,
          )
          .run({ id, kind, sale_line_id: saleLineId });

      expect(() => record("movement-3", "return", "line-1")).not.toThrow();
      expect(() => record("movement-4", "return", null)).not.toThrow();
      expect(() => record("movement-5", "loss", null)).not.toThrow();
      expect(() => record("movement-6", "loss", "line-1")).toThrow(/CHECK/);
      expect(() => record("movement-7", "sale_returned", null)).toThrow(/CHECK/);
    });
  });

  it("holds a return of a sale, who authorized it, and how its ticket was read", () => {
    withHeldSale((database) => {
      expect(() =>
        insertReturn(database, { id: "return-1", authorizedBy: "u2", source: "TYPED" }),
      ).not.toThrow();
      expect(() => insertReturn(database, { id: "return-2" })).not.toThrow();
      expect(() => insertReturn(database, { id: "return-1" })).toThrow(/UNIQUE|PRIMARY KEY/);
      expect(() => insertReturn(database, { id: "return-3", source: "SCAN" })).toThrow(/CHECK/);
      expect(
        database.prepare("SELECT id, authorized_by, ticket_source FROM returns ORDER BY id").all(),
      ).toEqual([
        { id: "return-1", authorized_by: "u2", ticket_source: "TYPED" },
        { id: "return-2", authorized_by: null, ticket_source: "QR" },
      ]);
    });
  });

  it("refuses a return in a session the register does not hold", () => {
    withHeldSale((database) => {
      expect(() => insertReturn(database, { id: "return-x", sessionId: "missing" })).toThrow(
        /FOREIGN KEY/,
      );
    });
  });

  it("holds a line returned once per return, with its reason, disposition and refund", () => {
    withHeldSale((database) => {
      insertReturn(database, { id: "return-1" });
      insertReturn(database, { id: "return-2" });

      expect(() => insertLine(database, {})).not.toThrow();
      expect(() => insertLine(database, {})).toThrow(/UNIQUE|PRIMARY KEY/);
      expect(() => insertLine(database, { return_id: "missing" })).toThrow(/FOREIGN KEY/);
      expect(() =>
        insertLine(database, { return_id: "return-2", disposition: "discard", refunded_amount: 0 }),
      ).not.toThrow();
    });
  });

  it.each([
    ["a quantity of nothing", { quantity: 0 }],
    ["a reason nobody gives", { reason: "wrong_size" }],
    ["a disposition nobody chooses", { disposition: "donate" }],
    ["a negative refund", { refunded_amount: -1 }],
  ])("refuses a returned line with %s", (_name, values) => {
    withHeldSale((database) => {
      insertReturn(database, { id: "return-1" });

      expect(() => insertLine(database, values)).toThrow(/CHECK/);
    });
  });

  it("finds the returns of a sale and the returns of a sale line by index", () => {
    withHeldSale((database) => {
      const indexedColumns = (table: string) =>
        database
          .prepare<[string], { name: string }>("SELECT name FROM pragma_index_list(?)")
          .all(table)
          .flatMap(({ name }) =>
            database
              .prepare<[string], { name: string }>("SELECT name FROM pragma_index_info(?)")
              .all(name)
              .slice(0, 1)
              .map((column) => column.name),
          );

      expect(indexedColumns("returns")).toContain("sale_id");
      expect(indexedColumns("return_lines")).toContain("sale_line_id");
    });
  });
});

describe("the awaiting contingency ticket recovery migration", () => {
  const MIGRATION = "0081_awaiting_contingency_ticket_recovery";

  function withDatabase(test: (database: ReturnType<typeof openLocalDatabase>) => void) {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const previous = LOCAL_MIGRATIONS.filter((migration) => migration.name < MIGRATION);
      expect(LOCAL_MIGRATIONS.map((migration) => migration.name)).toContain(MIGRATION);
      const path = join(folder, "register.sqlite");
      const before = openLocalDatabase(path, previous, migrationClock);
      before.exec(
        "INSERT INTO register_predecessor (device_id, last_acknowledged_seq) VALUES ('device-old', 52)",
      );
      before.close();
      const after = openLocalDatabase(path, LOCAL_MIGRATIONS, migrationClock);
      try {
        test(after);
      } finally {
        after.close();
      }
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  }

  it("keeps the predecessor held before it and awaits no recovery", () => {
    withDatabase((database) => {
      expect(
        database.prepare("SELECT device_id, last_acknowledged_seq FROM register_predecessor").all(),
      ).toEqual([{ device_id: "device-old", last_acknowledged_seq: 52 }]);
      expect(database.prepare("SELECT * FROM awaiting_contingency_ticket_recovery").all()).toEqual(
        [],
      );
    });
  });

  it("holds a predecessor once and refuses a negative acknowledged sequence", () => {
    withDatabase((database) => {
      database.exec(
        "INSERT INTO awaiting_contingency_ticket_recovery (device_id, last_acknowledged_seq) VALUES ('device-old', 0)",
      );

      expect(() =>
        database.exec(
          "INSERT INTO awaiting_contingency_ticket_recovery (device_id, last_acknowledged_seq) VALUES ('device-old', 3)",
        ),
      ).toThrow(/UNIQUE/);
      expect(() =>
        database.exec(
          "INSERT INTO awaiting_contingency_ticket_recovery (device_id, last_acknowledged_seq) VALUES ('device-other', -1)",
        ),
      ).toThrow(/CHECK/);
    });
  });
});

describe("the return credit notes migration", () => {
  const MIGRATION = "0085_return_credit_notes";

  type Database = ReturnType<typeof openLocalDatabase>;

  function withMigratedRegister(test: (database: Database) => void) {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const path = join(folder, "register.sqlite");
      const previous = LOCAL_MIGRATIONS.filter((migration) => migration.name < MIGRATION);
      expect(LOCAL_MIGRATIONS.map((migration) => migration.name)).toContain(MIGRATION);
      const before = openLocalDatabase(path, previous, migrationClock);
      before.exec(
        `INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
         VALUES ('s1', 'r1', 'device-a', 'u1', '2026-09-30T12:00:00.000Z', 0, 'OPEN');
         INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at, voided_at)
         VALUES ('sale-void-1', 'r1', 'device-a', 's1', 'u1', 'VOIDED', '2026-09-30T12:05:00.000Z', '2026-09-30T12:40:00.000Z'),
                ('sale-void-2', 'r1', 'device-a', 's1', 'u1', 'VOIDED', '2026-09-30T12:06:00.000Z', '2026-09-30T12:41:00.000Z'),
                ('sale-void-3', 'r1', 'device-a', 's1', 'u1', 'VOIDED', '2026-09-30T12:07:00.000Z', '2026-09-30T12:42:00.000Z'),
                ('sale-done', 'r1', 'device-a', 's1', 'u1', 'COMPLETED', '2026-09-30T12:08:00.000Z', NULL);`,
      );
      insertOfflineFiscalDocument(before, {
        id: "offline-doc-2",
        saleId: "sale-void-2",
        number: 1,
      });
      insertOfflineCreditNote(before, {
        id: "offline-note-2",
        saleId: "sale-void-2",
        creditNoteId: "note-offline",
        number: 1,
        corrects: { voucherType: 11, pointOfSale: 12, number: 1 },
      });
      before.exec(
        `INSERT INTO sale_void_credit_notes (
           id, sale_id, total, receiver_tax_status_code, corrected_voucher_type,
           corrected_point_of_sale, corrected_number, state, point_of_sale, number, issued_on,
           issued_at, authorization_code, authorization_code_due_on, recorded_at, answered_at
         ) VALUES (
           'note-authorized', 'sale-void-1', 1190000, 5, 11, 12, 41, 'AUTHORIZED', 12, 7,
           '2026-09-30', '2026-09-30T12:40:01.000Z', '71234567890999', '2026-10-10',
           '2026-09-30T12:40:00.000Z', '2026-09-30T12:52:05.000Z'
         );
         INSERT INTO sale_void_credit_notes (
           id, sale_id, total, receiver_tax_status_code, corrected_voucher_type,
           corrected_point_of_sale, corrected_number, state, recorded_at, answered_at,
           offline_fiscal_document_id
         ) VALUES (
           'note-offline', 'sale-void-2', 700000, 5, 11, 12, 1, 'ISSUED_OFFLINE',
           '2026-09-30T12:41:00.000Z', '2026-09-30T12:41:00.000Z', 'offline-note-2'
         );
         INSERT INTO sale_void_credit_notes (
           id, sale_id, total, receiver_tax_status_code, corrected_voucher_type,
           corrected_point_of_sale, corrected_number, state, recorded_at
         ) VALUES (
           'note-pending', 'sale-void-3', 450000, 5, 11, 12, 43, 'IN_PROGRESS',
           '2026-09-30T12:42:00.000Z'
         );
         INSERT INTO replenished_credit_note_requests (
           credit_note_id, event_id, device_seq, aggregate_type, aggregate_id, event_type,
           schema_version, payload, occurred_at, actor_id, chain_hmac
         ) VALUES (
           'note-pending', 'event-1', 3, 'Sale', 'sale-void-3', 'sale_voided', 1, '{}',
           '2026-09-30T12:42:00.000Z', 'u1', 'hmac'
         );
         INSERT INTO payment_transactions (id, sale_id, kind, method, provider, amount, tendered, authorized_by, confirmed_at, state, occurred_at)
         VALUES ('pay-void-1', 'sale-void-1', 'SALE', 'CASH', 'NONE', 1190000, 1190000, NULL, NULL, 'APPROVED', '2026-09-30T12:05:00.000Z');
         INSERT INTO payment_refunds (id, payment_id, method, provider, amount, state, occurred_at)
         VALUES ('refund-void-1', 'pay-void-1', 'CASH', 'NONE', 1190000, 'APPROVED', '2026-09-30T12:40:00.000Z');
         INSERT INTO credit_note_prints (sale_id, print_attempted_at, printed_at)
         VALUES ('sale-void-1', '2026-09-30T12:53:00.000Z', '2026-09-30T12:53:04.000Z'),
                ('sale-void-2', '2026-09-30T12:54:00.000Z', NULL);
         INSERT INTO credit_note_receipts (sale_id, template_version, head, body)
         VALUES ('sale-void-1', 'v1', x'0102', x'0304');`,
      );
      before.close();
      const after = openLocalDatabase(path, LOCAL_MIGRATIONS, migrationClock);
      try {
        test(after);
      } finally {
        after.close();
      }
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  }

  function insertReturn(database: Database, id: string, saleId = "sale-done") {
    database
      .prepare(
        `INSERT INTO returns (id, sale_id, register_id, device_id, session_id, actor_id, ticket_source, occurred_at)
         VALUES (@id, @sale_id, 'r1', 'device-a', 's1', 'u1', 'QR', '2026-10-13T12:00:00.000Z')`,
      )
      .run({ id, sale_id: saleId });
  }

  function insertReturnNote(database: Database, fields: Record<string, string | number | null>) {
    return database
      .prepare(
        `INSERT INTO sale_credit_notes (
           id, sale_id, return_id, requested_issue_on, total, receiver_tax_status_code,
           corrected_voucher_type, corrected_point_of_sale, corrected_number, state, recorded_at,
           answered_at
         ) VALUES (
           @id, @sale_id, @return_id, @requested_issue_on, 1000, @receiver_tax_status_code,
           @corrected_voucher_type, @corrected_point_of_sale, @corrected_number, @state,
           '2026-10-13T12:00:00.000Z', @answered_at
         )`,
      )
      .run({
        sale_id: "sale-done",
        return_id: "return-1",
        requested_issue_on: "2026-10-13",
        receiver_tax_status_code: 5,
        corrected_voucher_type: 11,
        corrected_point_of_sale: 12,
        corrected_number: 41,
        state: "IN_PROGRESS",
        answered_at: null,
        ...fields,
      });
  }

  const NO_VOUCHER = {
    receiver_tax_status_code: null,
    corrected_voucher_type: null,
    corrected_point_of_sale: null,
    corrected_number: null,
  };

  it("keeps every credit note of a voided sale, answered or not, as a credit note of no return", () => {
    withMigratedRegister((database) => {
      expect(
        database
          .prepare(
            `SELECT id, sale_id, return_id, requested_issue_on, total, receiver_tax_status_code,
                    corrected_voucher_type, corrected_point_of_sale, corrected_number, state,
                    point_of_sale, number, issued_on, issued_at, authorization_code,
                    authorization_code_due_on, recorded_at, answered_at, offline_fiscal_document_id
               FROM sale_credit_notes ORDER BY id`,
          )
          .all(),
      ).toEqual([
        {
          id: "note-authorized",
          sale_id: "sale-void-1",
          return_id: null,
          requested_issue_on: null,
          total: 1190000,
          receiver_tax_status_code: 5,
          corrected_voucher_type: 11,
          corrected_point_of_sale: 12,
          corrected_number: 41,
          state: "AUTHORIZED",
          point_of_sale: 12,
          number: 7,
          issued_on: "2026-09-30",
          issued_at: "2026-09-30T12:40:01.000Z",
          authorization_code: "71234567890999",
          authorization_code_due_on: "2026-10-10",
          recorded_at: "2026-09-30T12:40:00.000Z",
          answered_at: "2026-09-30T12:52:05.000Z",
          offline_fiscal_document_id: null,
        },
        {
          id: "note-offline",
          sale_id: "sale-void-2",
          return_id: null,
          requested_issue_on: null,
          total: 700000,
          receiver_tax_status_code: 5,
          corrected_voucher_type: 11,
          corrected_point_of_sale: 12,
          corrected_number: 1,
          state: "ISSUED_OFFLINE",
          point_of_sale: null,
          number: null,
          issued_on: null,
          issued_at: null,
          authorization_code: null,
          authorization_code_due_on: null,
          recorded_at: "2026-09-30T12:41:00.000Z",
          answered_at: "2026-09-30T12:41:00.000Z",
          offline_fiscal_document_id: "offline-note-2",
        },
        {
          id: "note-pending",
          sale_id: "sale-void-3",
          return_id: null,
          requested_issue_on: null,
          total: 450000,
          receiver_tax_status_code: 5,
          corrected_voucher_type: 11,
          corrected_point_of_sale: 12,
          corrected_number: 43,
          state: "IN_PROGRESS",
          point_of_sale: null,
          number: null,
          issued_on: null,
          issued_at: null,
          authorization_code: null,
          authorization_code_due_on: null,
          recorded_at: "2026-09-30T12:42:00.000Z",
          answered_at: null,
          offline_fiscal_document_id: null,
        },
      ]);
      expect(database.pragma("foreign_key_check")).toEqual([]);
      expect(
        database.prepare("SELECT credit_note_id FROM replenished_credit_note_requests").all(),
      ).toEqual([{ credit_note_id: "note-pending" }]);
    });
  });

  it("keeps the prints and the stored receipts of the credit notes, now of their credit note", () => {
    withMigratedRegister((database) => {
      expect(
        database
          .prepare(
            "SELECT credit_note_id, print_attempted_at, printed_at FROM credit_note_prints ORDER BY credit_note_id",
          )
          .all(),
      ).toEqual([
        {
          credit_note_id: "note-authorized",
          print_attempted_at: "2026-09-30T12:53:00.000Z",
          printed_at: "2026-09-30T12:53:04.000Z",
        },
        {
          credit_note_id: "note-offline",
          print_attempted_at: "2026-09-30T12:54:00.000Z",
          printed_at: null,
        },
      ]);
      expect(
        database
          .prepare<
            [],
            { credit_note_id: string; template_version: string; head: Buffer; body: Buffer }
          >("SELECT credit_note_id, template_version, head, body FROM credit_note_receipts")
          .all()
          .map(({ head, body, ...receipt }) => ({
            ...receipt,
            head: [...head],
            body: [...body],
          })),
      ).toEqual([
        { credit_note_id: "note-authorized", template_version: "v1", head: [1, 2], body: [3, 4] },
      ]);
    });
  });

  it("keeps the refunds the register already holds, tied to no return", () => {
    withMigratedRegister((database) => {
      expect(
        database.prepare("SELECT id, amount, return_id FROM payment_refunds ORDER BY id").all(),
      ).toEqual([{ id: "refund-void-1", amount: 1190000, return_id: null }]);
    });
  });

  it("lets a refund name the return it gives back, and only a return the register holds", () => {
    withMigratedRegister((database) => {
      insertReturn(database, "return-1");
      const refund = (id: string, returnId: string | null) =>
        database
          .prepare(
            `INSERT INTO payment_refunds (id, payment_id, method, provider, amount, state, occurred_at, return_id)
             VALUES (?, 'pay-void-1', 'CASH', 'NONE', 100, 'APPROVED', '2026-10-13T12:00:00.000Z', ?)`,
          )
          .run(id, returnId);

      expect(() => refund("refund-of-return", "return-1")).not.toThrow();
      expect(() => refund("refund-of-sale", null)).not.toThrow();
      expect(() => refund("refund-of-nothing", "missing")).toThrow(/FOREIGN KEY/);
    });
  });

  it("prints and stores the receipt of a credit note once, and only for a credit note the register holds", () => {
    withMigratedRegister((database) => {
      const print = (creditNoteId: string) =>
        database
          .prepare(
            "INSERT INTO credit_note_prints (credit_note_id, print_attempted_at) VALUES (?, '2026-10-13T12:00:00.000Z')",
          )
          .run(creditNoteId);

      expect(() => print("note-pending")).not.toThrow();
      expect(() => print("note-pending")).toThrow(/UNIQUE|PRIMARY KEY/);
      expect(() => print("missing")).toThrow(/FOREIGN KEY/);

      const store = (creditNoteId: string) =>
        database
          .prepare(
            "INSERT INTO credit_note_receipts (credit_note_id, template_version, head, body) VALUES (?, '1', x'00', x'01')",
          )
          .run(creditNoteId);
      expect(() => store("note-pending")).not.toThrow();
      expect(() => store("note-pending")).toThrow(/UNIQUE|PRIMARY KEY/);
      expect(() => store("missing")).toThrow(/FOREIGN KEY/);
    });
  });

  it("keeps the offline documents of a voided sale and lets a sale hold more than one credit note", () => {
    withMigratedRegister((database) => {
      expect(
        database
          .prepare(
            "SELECT id, document_type, credit_note_id FROM offline_fiscal_documents ORDER BY id",
          )
          .all(),
      ).toEqual([
        { id: "offline-doc-2", document_type: "factura_c", credit_note_id: null },
        { id: "offline-note-2", document_type: "credit_note_c", credit_note_id: "note-offline" },
      ]);

      expect(() =>
        insertOfflineCreditNote(database, {
          id: "offline-note-3",
          saleId: "sale-void-2",
          creditNoteId: "note-extra",
          number: 2,
        }),
      ).not.toThrow();
      expect(() =>
        insertOfflineCreditNote(database, {
          id: "offline-note-4",
          saleId: "sale-void-2",
          creditNoteId: "note-extra",
          number: 3,
        }),
      ).toThrow(/UNIQUE/);
      expect(() =>
        insertOfflineFiscalDocument(database, {
          id: "offline-doc-3",
          saleId: "sale-void-2",
          number: 2,
        }),
      ).toThrow(/UNIQUE/);
    });
  });

  it("holds the credit note of a return, dated by the return, once per return", () => {
    withMigratedRegister((database) => {
      insertReturn(database, "return-1");
      insertReturn(database, "return-2");

      expect(() => insertReturnNote(database, { id: "note-r1" })).not.toThrow();
      expect(() =>
        insertReturnNote(database, { id: "note-r1-again", corrected_number: 42 }),
      ).toThrow(/UNIQUE/);
      expect(() =>
        insertReturnNote(database, { id: "note-r2", return_id: "return-2", corrected_number: 42 }),
      ).not.toThrow();
      expect(() => insertReturnNote(database, { id: "note-r3", return_id: "missing" })).toThrow(
        /FOREIGN KEY/,
      );
      expect(() =>
        insertReturnNote(database, {
          id: "note-r4",
          return_id: null,
          requested_issue_on: "2026-10-13",
        }),
      ).toThrow(/CHECK/);
      expect(() =>
        insertReturnNote(database, {
          id: "note-r5",
          return_id: "return-2",
          requested_issue_on: null,
        }),
      ).toThrow(/CHECK/);
    });
  });

  it("holds one credit note for a voided sale", () => {
    withMigratedRegister((database) => {
      expect(() =>
        insertReturnNote(database, {
          id: "note-second",
          sale_id: "sale-void-1",
          return_id: null,
          requested_issue_on: null,
        }),
      ).toThrow(/UNIQUE/);
    });
  });

  it("holds a credit note of a return still waiting for its invoice, with no invoice to correct yet", () => {
    withMigratedRegister((database) => {
      insertReturn(database, "return-1");
      insertReturn(database, "return-2");

      expect(() =>
        insertReturnNote(database, {
          id: "note-waiting",
          state: "AWAITING_INVOICE",
          ...NO_VOUCHER,
        }),
      ).not.toThrow();
      expect(() =>
        insertReturnNote(database, {
          id: "note-regularize",
          return_id: "return-2",
          state: "REGULARIZATION_REQUIRED",
          answered_at: "2026-10-13T12:05:00.000Z",
          ...NO_VOUCHER,
        }),
      ).not.toThrow();
    });
  });

  it.each([
    ["a waiting credit note that already has an invoice", { state: "AWAITING_INVOICE" }],
    ["a requested credit note with no invoice", { state: "IN_PROGRESS", ...NO_VOUCHER }],
    ["an invoice with part of its voucher", { corrected_number: null }],
    [
      "a waiting credit note that is answered",
      { state: "AWAITING_INVOICE", answered_at: "2026-10-13T12:05:00.000Z", ...NO_VOUCHER },
    ],
    ["a requested credit note that is answered", { answered_at: "2026-10-13T12:05:00.000Z" }],
    ["a state nobody reaches", { state: "LOST" }],
  ])("refuses %s", (_name, fields) => {
    withMigratedRegister((database) => {
      insertReturn(database, "return-1");

      expect(() => insertReturnNote(database, { id: "note-refused", ...fields })).toThrow(/CHECK/);
    });
  });

  it("refuses a voided sale's credit note with no invoice", () => {
    withMigratedRegister((database) => {
      expect(() =>
        insertReturnNote(database, {
          id: "note-void-no-invoice",
          sale_id: "sale-done",
          return_id: null,
          requested_issue_on: null,
          ...NO_VOUCHER,
          state: "AWAITING_INVOICE",
        }),
      ).toThrow(/CHECK/);
    });
  });

  it("keeps the replenished request of a credit note tied to that credit note", () => {
    withMigratedRegister((database) => {
      expect(
        database.prepare("SELECT credit_note_id FROM replenished_credit_note_requests").all(),
      ).toEqual([{ credit_note_id: "note-pending" }]);
      expect(database.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
      expect(() =>
        database
          .prepare(
            `INSERT INTO replenished_credit_note_requests (
               credit_note_id, event_id, device_seq, aggregate_type, aggregate_id, event_type,
               schema_version, payload, occurred_at, actor_id, chain_hmac
             ) VALUES (
               'note-missing', 'event-2', 4, 'Sale', 'sale-void-3', 'sale_voided', 1, '{}',
               '2026-09-30T12:43:00.000Z', 'u1', 'hmac'
             )`,
          )
          .run(),
      ).toThrow(/FOREIGN KEY/);
    });
  });

  it("finds the credit notes of a sale by index and the ones still to answer by their own index", () => {
    withMigratedRegister((database) => {
      const indexed = (table: string) =>
        database
          .prepare<[string], { name: string }>("SELECT name FROM pragma_index_list(?)")
          .all(table)
          .flatMap(({ name }) =>
            database
              .prepare<[string], { name: string }>("SELECT name FROM pragma_index_info(?)")
              .all(name)
              .slice(0, 1)
              .map((column) => column.name),
          );

      expect(indexed("sale_credit_notes")).toContain("sale_id");
      expect(
        database
          .prepare<[], { sql: string }>(
            "SELECT sql FROM sqlite_schema WHERE name = 'sale_credit_notes_in_progress'",
          )
          .get()?.sql,
      ).toContain("AWAITING_INVOICE");
    });
  });
});

describe("the Point card type migration", () => {
  const MIGRATION = "0083_point_card_type";

  type Database = ReturnType<typeof openLocalDatabase>;

  function withHeldPayments(test: (database: Database) => void) {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const path = join(folder, "register.sqlite");
      const previous = LOCAL_MIGRATIONS.filter((migration) => migration.name < MIGRATION);
      expect(LOCAL_MIGRATIONS.map((migration) => migration.name)).toContain(MIGRATION);
      const before = openLocalDatabase(path, previous, migrationClock);
      before.exec(
        `INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
         VALUES ('s1', 'r1', 'device-a', 'u1', '2026-10-09T12:00:00.000Z', 0, 'OPEN');
         INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at)
         VALUES ('sale-1', 'r1', 'device-a', 's1', 'u1', 'COMPLETED', '2026-10-09T12:05:00.000Z');
         INSERT INTO payment_transactions (id, sale_id, kind, method, provider, amount, tendered, state, occurred_at)
         VALUES ('cash-1', 'sale-1', 'SALE', 'CASH', 'NONE', 1000, 1000, 'APPROVED', '2026-10-09T12:05:00.000Z');
         INSERT INTO payment_transactions (id, sale_id, kind, method, provider, amount, state, occurred_at, wait_ends_at)
         VALUES ('point-1', 'sale-1', 'SALE', 'POINT', 'MERCADOPAGO_POINT', 2500, 'APPROVED', '2026-10-09T12:06:00.000Z', '2026-10-09T12:09:00.000Z');
         INSERT INTO payment_refunds (id, payment_id, method, provider, amount, state, occurred_at)
         VALUES ('refund-1', 'point-1', 'POINT', 'MERCADOPAGO_POINT', 500, 'PENDING', '2026-10-09T12:10:00.000Z');`,
      );
      before.close();
      const after = openLocalDatabase(path, LOCAL_MIGRATIONS, migrationClock);
      try {
        test(after);
      } finally {
        after.close();
      }
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  }

  function insertPayment(
    database: Database,
    fields: { id: string; method: string; provider: string; cardType: string | null },
  ) {
    const waiting = fields.method === "POINT" || fields.method === "QR";
    return database
      .prepare(
        `INSERT INTO payment_transactions (id, sale_id, kind, method, provider, card_type, amount, state, occurred_at, wait_ends_at)
         VALUES (@id, 'sale-1', 'SALE', @method, @provider, @card_type, 700, @state, '2026-10-09T12:20:00.000Z', @wait_ends_at)`,
      )
      .run({
        id: fields.id,
        method: fields.method,
        provider: fields.provider,
        card_type: fields.cardType,
        state: waiting ? "PENDING" : "APPROVED",
        wait_ends_at: waiting ? "2026-10-09T12:23:00.000Z" : null,
      });
  }

  it("keeps the payments and refunds held before it, none with a card type", () => {
    withHeldPayments((database) => {
      expect(
        database
          .prepare(
            "SELECT id, method, amount, tendered, card_type FROM payment_transactions ORDER BY id",
          )
          .all(),
      ).toEqual([
        { id: "cash-1", method: "CASH", amount: 1000, tendered: 1000, card_type: null },
        { id: "point-1", method: "POINT", amount: 2500, tendered: null, card_type: null },
      ]);
      expect(database.prepare("SELECT id, payment_id FROM payment_refunds").all()).toEqual([
        { id: "refund-1", payment_id: "point-1" },
      ]);
    });
  });

  it("keeps the index of the payments of a sale", () => {
    withHeldPayments((database) => {
      expect(
        database
          .prepare(
            "SELECT name FROM sqlite_schema WHERE type = 'index' AND name = 'payment_transactions_by_sale'",
          )
          .all(),
      ).toEqual([{ name: "payment_transactions_by_sale" }]);
    });
  });

  it.each(["DEBIT", "CREDIT", null])("accepts a Point payment with card type %s", (cardType) => {
    withHeldPayments((database) => {
      expect(() =>
        insertPayment(database, {
          id: "point-2",
          method: "POINT",
          provider: "MERCADOPAGO_POINT",
          cardType,
        }),
      ).not.toThrow();
    });
  });

  it.each([
    ["a Point payment of another card type", "POINT", "MERCADOPAGO_POINT", "PREPAID"],
    ["a QR payment with a card type", "QR", "MERCADOPAGO_QR", "DEBIT"],
    ["a cash payment with a card type", "CASH", "NONE", "CREDIT"],
  ])("refuses %s", (_name, method, provider, cardType) => {
    withHeldPayments((database) => {
      expect(() =>
        insertPayment(database, { id: "payment-2", method, provider, cardType }),
      ).toThrow(/CHECK/);
    });
  });
});

describe("the returns of other registers' sales migration", () => {
  const MIGRATION = "0086_returns_of_branch_sales";

  type Database = ReturnType<typeof openLocalDatabase>;

  function withHeldReturn(test: (database: Database) => void) {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const path = join(folder, "register.sqlite");
      const previous = LOCAL_MIGRATIONS.filter((migration) => migration.name < MIGRATION);
      expect(LOCAL_MIGRATIONS.map((migration) => migration.name)).toContain(MIGRATION);
      const before = openLocalDatabase(path, previous, migrationClock);
      before.exec(
        `INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
         VALUES ('s1', 'r1', 'device-a', 'u1', '2026-10-09T12:00:00.000Z', 0, 'OPEN');
         INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at)
         VALUES ('sale-1', 'r1', 'device-a', 's1', 'u1', 'COMPLETED', '2026-10-09T12:05:00.000Z');
         INSERT INTO sale_lines (id, sale_id, position, product_id, product_name, quantity, list_unit_price, price_list_id, line_total)
         VALUES ('line-1', 'sale-1', 1, 'p1', 'Yerba', 2, 1500, 'list-1', 3000);
         INSERT INTO payment_transactions (id, sale_id, kind, method, provider, amount, tendered, authorized_by, confirmed_at, state, occurred_at)
         VALUES ('pay-1', 'sale-1', 'SALE', 'CASH', 'NONE', 3000, 3000, NULL, NULL, 'APPROVED', '2026-10-09T12:05:00.000Z');
         INSERT INTO returns (id, sale_id, register_id, device_id, session_id, actor_id, authorized_by, ticket_source, occurred_at)
         VALUES ('return-1', 'sale-1', 'r1', 'device-a', 's1', 'u1', 'u2', 'TYPED', '2026-10-12T12:00:00.000Z');
         INSERT INTO return_lines (return_id, sale_line_id, quantity, reason, disposition, refunded_amount)
         VALUES ('return-1', 'line-1', 1, 'defective', 'discard', 1500);
         INSERT INTO payment_refunds (id, payment_id, method, provider, amount, state, occurred_at)
         VALUES ('refund-1', 'pay-1', 'CASH', 'NONE', 1500, 'APPROVED', '2026-10-12T12:00:00.000Z');
         INSERT INTO stock_movements (id, product_id, kind, sale_line_id, delta, occurred_at)
         VALUES ('movement-1', 'p1', 'return', 'line-1', 1, '2026-10-12T12:00:00.000Z'),
                ('movement-2', 'p1', 'loss', NULL, -1, '2026-10-12T12:07:00.000Z');`,
      );
      before.close();
      const after = openLocalDatabase(path, LOCAL_MIGRATIONS, migrationClock);
      try {
        test(after);
      } finally {
        after.close();
      }
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  }

  const insertReturn = (database: Database, values: Record<string, string> = {}) =>
    database
      .prepare(
        `INSERT INTO returns (id, sale_id, register_id, device_id, session_id, actor_id, authorized_by, ticket_source, occurred_at)
         VALUES (@id, @sale_id, 'r2', 'device-b', @session_id, 'u1', NULL, @ticket_source, '2026-10-13T12:00:00.000Z')`,
      )
      .run({
        id: "return-2",
        sale_id: "sale-of-another-register",
        session_id: "s1",
        ticket_source: "QR",
        ...values,
      });

  const insertLine = (database: Database, values: Record<string, string | number> = {}) =>
    database
      .prepare(
        `INSERT INTO return_lines (return_id, sale_line_id, quantity, reason, disposition, refunded_amount)
         VALUES (@return_id, @sale_line_id, @quantity, 'change_of_mind', 'restock', 500)`,
      )
      .run({
        return_id: "return-2",
        sale_line_id: "line-of-another-register",
        quantity: 1,
        ...values,
      });

  const insertRefund = (database: Database, values: Record<string, string | number | null> = {}) =>
    database
      .prepare(
        `INSERT INTO payment_refunds (id, payment_id, return_id, method, provider, amount, state, occurred_at)
         VALUES (@id, @payment_id, @return_id, @method, @provider, @amount, @state, '2026-10-13T12:00:00.000Z')`,
      )
      .run({
        id: "refund-2",
        payment_id: "payment-of-another-register",
        return_id: "return-2",
        method: "CASH",
        provider: "NONE",
        amount: 500,
        state: "APPROVED",
        ...values,
      });

  const insertMovement = (database: Database, values: Record<string, string | null> = {}) =>
    database
      .prepare(
        `INSERT INTO stock_movements (id, product_id, kind, sale_line_id, delta, occurred_at)
         VALUES (@id, 'p1', @kind, @sale_line_id, 1, '2026-10-13T12:00:00.000Z')`,
      )
      .run({
        id: "movement-3",
        kind: "return",
        sale_line_id: "line-of-another-register",
        ...values,
      });

  it("keeps the returns, their lines, their refunds and their stock movements a register holds", () => {
    withHeldReturn((database) => {
      expect(database.prepare("SELECT id, sale_id, authorized_by FROM returns").all()).toEqual([
        { id: "return-1", sale_id: "sale-1", authorized_by: "u2" },
      ]);
      expect(
        database.prepare("SELECT return_id, sale_line_id, refunded_amount FROM return_lines").all(),
      ).toEqual([{ return_id: "return-1", sale_line_id: "line-1", refunded_amount: 1500 }]);
      expect(
        database.prepare("SELECT id, payment_id, return_id, amount FROM payment_refunds").all(),
      ).toEqual([{ id: "refund-1", payment_id: "pay-1", return_id: null, amount: 1500 }]);
      expect(
        database.prepare("SELECT id, kind, sale_line_id FROM stock_movements ORDER BY id").all(),
      ).toEqual([
        { id: "movement-1", kind: "return", sale_line_id: "line-1" },
        { id: "movement-2", kind: "loss", sale_line_id: null },
      ]);
      expect(database.pragma("foreign_key_check")).toEqual([]);
    });
  });

  it("keeps the indexes of the four tables", () => {
    withHeldReturn((database) => {
      expect(
        database
          .prepare<[], { name: string }>(
            `SELECT name FROM sqlite_schema WHERE type = 'index' AND name IN (
               'returns_by_sale', 'return_lines_by_sale_line', 'payment_refunds_by_payment', 'stock_movements_by_product'
             ) ORDER BY name`,
          )
          .all()
          .map(({ name }) => name),
      ).toEqual([
        "payment_refunds_by_payment",
        "return_lines_by_sale_line",
        "returns_by_sale",
        "stock_movements_by_product",
      ]);
    });
  });

  it("records a return, its line, its refund and its stock movement for a sale the register does not hold", () => {
    withHeldReturn((database) => {
      expect(() => insertReturn(database)).not.toThrow();
      expect(() => insertLine(database)).not.toThrow();
      expect(() => insertRefund(database)).not.toThrow();
      expect(() => insertMovement(database)).not.toThrow();
    });
  });

  it("refuses a return in a session the register does not hold", () => {
    withHeldReturn((database) => {
      expect(() => insertReturn(database, { session_id: "missing" })).toThrow(/FOREIGN KEY/);
    });
  });

  it("refuses a line, or a refund, of a return the register does not hold", () => {
    withHeldReturn((database) => {
      expect(() => insertLine(database, { return_id: "missing" })).toThrow(/FOREIGN KEY/);
      expect(() => insertRefund(database, { return_id: "missing" })).toThrow(/FOREIGN KEY/);
    });
  });

  it("refuses a return of one sale line twice in the same return", () => {
    withHeldReturn((database) => {
      insertReturn(database);
      insertLine(database);

      expect(() => insertLine(database)).toThrow(/UNIQUE|PRIMARY KEY/);
    });
  });

  it("still refuses what a return, its line, its refund and its stock movement refused", () => {
    withHeldReturn((database) => {
      insertReturn(database);

      expect(() => insertReturn(database, { id: "return-3", ticket_source: "SCAN" })).toThrow(
        /CHECK/,
      );
      expect(() => insertLine(database, { quantity: 0 })).toThrow(/CHECK/);
      expect(() => insertRefund(database, { amount: 0 })).toThrow(/CHECK/);
      expect(() => insertRefund(database, { state: "REJECTED" })).toThrow(/CHECK/);
      expect(() => insertRefund(database, { provider: "MERCADOPAGO_QR" })).toThrow(/CHECK/);
      expect(() => insertMovement(database, { kind: "sale_returned" })).toThrow(/CHECK/);
      expect(() => insertMovement(database, { kind: "loss" })).toThrow(/CHECK/);
    });
  });

  it("keeps a copy of a branch sale once per sale", () => {
    withHeldReturn((database) => {
      database.exec("INSERT INTO branch_sales_for_return (sale_id, facts) VALUES ('sale-9', '{}')");

      expect(() =>
        database.exec(
          "INSERT INTO branch_sales_for_return (sale_id, facts) VALUES ('sale-9', '{}')",
        ),
      ).toThrow(/UNIQUE|PRIMARY KEY/);
      expect(() =>
        database.exec(
          "INSERT INTO branch_sales_for_return (sale_id, facts) VALUES ('sale-8', 'x')",
        ),
      ).toThrow(/CHECK/);
    });
  });
});
