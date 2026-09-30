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
      expect(LOCAL_MIGRATIONS.slice(previous.length)[0]?.name).toBe("0009_sales");
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

  it("add the promotion of each sale line over the open sales a register already holds", () => {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const path = join(folder, "register.sqlite");
      const previous = LOCAL_MIGRATIONS.slice(0, 10);
      expect(previous.at(-1)?.name).toBe("0009_sales");
      expect(LOCAL_MIGRATIONS.slice(previous.length).map((migration) => migration.name)).toEqual([
        "0010_sale_line_promotions",
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

      const after = openLocalDatabase(path, LOCAL_MIGRATIONS);

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

  it("add payment transactions over the open sale and cash movements a register already holds", () => {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-migrations-"));
    try {
      const path = join(folder, "register.sqlite");
      const previous = LOCAL_MIGRATIONS.slice(0, 11);
      expect(previous.at(-1)?.name).toBe("0010_sale_line_promotions");
      expect(LOCAL_MIGRATIONS.slice(previous.length).map((migration) => migration.name)).toEqual([
        "0012_payment_transactions",
      ]);
      const before = openLocalDatabase(path, previous);
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

      const after = openLocalDatabase(path, LOCAL_MIGRATIONS);

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
      const database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS);
      database
        .prepare(
          `INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
           VALUES ('s1', 'r1', 'device-a', 'u1', '2026-09-30T12:00:00.000Z', 0, 'OPEN')`,
        )
        .run();
      database
        .prepare(
          `INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at)
           VALUES ('sale-1', 'r1', 'device-a', 's1', 'u1', 'OPEN', '2026-09-30T12:05:00.000Z')`,
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
});
