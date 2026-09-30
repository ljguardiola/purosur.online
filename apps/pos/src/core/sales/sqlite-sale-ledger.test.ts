import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addScannedProduct, currentSale } from "@purosur/domain/sales/use-cases";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SqliteSignInStore } from "../access/sqlite-sign-in-store";
import { type LocalDatabase, openLocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { SqliteSaleLedger } from "./sqlite-sale-ledger";

const NOW = new Date("2026-09-30T12:00:00.000Z");

let database: LocalDatabase;
let ledger: SqliteSaleLedger;
let idCount: number;

const ids = {
  next: () => {
    idCount += 1;
    return `id-${idCount}`;
  },
};

function scan(code: string) {
  return addScannedProduct({ ledger, clock: { now: () => NOW }, ids }, { actorId: "u1", code });
}

function addCashier(): void {
  database
    .prepare(
      "INSERT INTO roles (id, name, is_administrator, version) VALUES ('cashier', 'Cajera', 0, 1)",
    )
    .run();
  database
    .prepare(
      "INSERT INTO users (id, first_name, role_id, salt, active, version) VALUES ('u1', 'Ada', 'cashier', 's', 1, 1)",
    )
    .run();
  database
    .prepare(
      "INSERT INTO role_permissions (role_id, permission_key, active) VALUES ('cashier', 'sell_and_charge', 1)",
    )
    .run();
}

function enrol(): void {
  database
    .prepare("INSERT INTO own_register (id, name, version) VALUES ('register-1', 'Caja 1', 1)")
    .run();
  database.prepare("UPDATE sync_state SET device_id = 'device-1'").run();
}

function openSession(): void {
  database
    .prepare(
      `INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
       VALUES ('session-1', 'register-1', 'device-1', 'u1', '2026-09-30T08:00:00.000Z', 0, 'OPEN')`,
    )
    .run();
}

interface ProductOptions {
  id?: string;
  name?: string;
  unit?: string;
  active?: boolean;
  removed?: boolean;
}

function addProduct(code: string | undefined, options: ProductOptions = {}): string {
  const id = options.id ?? "p1";
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
  if (code !== undefined) {
    addBarcode(id, code);
  }
  return id;
}

function addBarcode(productId: string, code: string, active = true, position = 1): void {
  database
    .prepare(
      "INSERT INTO product_barcodes (product_id, position, code, active) VALUES (?, ?, ?, ?)",
    )
    .run(productId, position, code, active ? 1 : 0);
}

function addPrice(
  productId: string,
  validFrom: string,
  unitPrice: number,
  options: { id?: string; version?: number; removed?: boolean; priceListId?: string } = {},
): void {
  database
    .prepare(
      `INSERT INTO prices (id, product_id, price_list_id, unit_price, valid_from, version, removed)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      options.id ?? `price-${productId}-${validFrom}-${unitPrice}`,
      productId,
      options.priceListId ?? "list-1",
      unitPrice,
      validFrom,
      options.version ?? 1,
      options.removed ? 1 : 0,
    );
}

function readySeller(): void {
  addCashier();
  enrol();
  openSession();
}

beforeEach(() => {
  idCount = 0;
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS);
  ledger = new SqliteSaleLedger(database, new SqliteSignInStore(database));
});

afterEach(() => {
  database.close();
});

describe("scanning a barcode", () => {
  beforeEach(readySeller);

  it("finds the active product that holds the exact code", () => {
    addProduct("7791234567890");
    addPrice("p1", "2026-09-01T00:00:00.000Z", 1500);

    const outcome = scan("7791234567890");

    expect(outcome).toMatchObject({
      kind: "added",
      sale: {
        lines: [{ productId: "p1", productName: "Yerba", quantity: 1, listUnitPrice: 1500 }],
      },
    });
  });

  it.each([
    ["a code that is only part of the barcode", "779123456789"],
    ["a code with another case", "abc-1"],
  ])("does not find the product by %s", (_case, code) => {
    addProduct("7791234567890");
    addBarcode("p1", "ABC-1", true, 2);
    addPrice("p1", "2026-09-01T00:00:00.000Z", 1500);

    expect(scan(code)).toEqual({ kind: "unknown_code" });
  });

  it("finds a product by any of its barcodes", () => {
    addProduct("111");
    addBarcode("p1", "222", true, 2);
    addPrice("p1", "2026-09-01T00:00:00.000Z", 1500);

    expect(scan("222")).toMatchObject({ kind: "added" });
  });

  it.each([
    ["an inactive product", { active: false }, true],
    ["a removed product", { removed: true }, true],
    ["an inactive barcode", {}, false],
  ])("does not find %s", (_case, options, barcodeActive) => {
    addProduct(undefined, options);
    addBarcode("p1", "111", barcodeActive);
    addPrice("p1", "2026-09-01T00:00:00.000Z", 1500);

    expect(scan("111")).toEqual({ kind: "unknown_code" });
  });

  it("names a product sold by weight without adding it", () => {
    addProduct("111", { unit: "KG", name: "Queso" });
    addPrice("p1", "2026-09-01T00:00:00.000Z", 1500);

    expect(scan("111")).toEqual({ kind: "sold_by_weight", productName: "Queso" });
    expect(database.prepare("SELECT id FROM sales").all()).toEqual([]);
  });
});

describe("the price a scan takes", () => {
  beforeEach(() => {
    readySeller();
    addProduct("111");
  });

  function scannedPrice() {
    const outcome = scan("111");
    return outcome.kind === "added" ? outcome.sale.lines[0] : outcome;
  }

  it("is the latest one already valid, ignoring a future one and an older one", () => {
    addPrice("p1", "2026-08-01T00:00:00.000Z", 1000);
    addPrice("p1", "2026-09-15T00:00:00.000Z", 1200);
    addPrice("p1", "2026-10-15T00:00:00.000Z", 1800);

    expect(scannedPrice()).toMatchObject({ listUnitPrice: 1200, priceListId: "list-1" });
  });

  it("starts applying at the very millisecond it becomes valid", () => {
    addPrice("p1", "2026-09-30T12:00:00.000Z", 1300);
    addPrice("p1", "2026-09-30T12:00:00.001Z", 1400);

    expect(scannedPrice()).toMatchObject({ listUnitPrice: 1300 });
  });

  it("ignores a removed price", () => {
    addPrice("p1", "2026-08-01T00:00:00.000Z", 1000);
    addPrice("p1", "2026-09-15T00:00:00.000Z", 1200, { removed: true });

    expect(scannedPrice()).toMatchObject({ listUnitPrice: 1000 });
  });

  it("ignores the prices of other products", () => {
    addProduct("222", { id: "p2", name: "Azucar" });
    addPrice("p2", "2026-09-15T00:00:00.000Z", 9999);

    expect(scannedPrice()).toEqual({ kind: "no_price", productName: "Yerba" });
  });

  it("is missing while every price of the product starts in the future", () => {
    addPrice("p1", "2026-10-15T00:00:00.000Z", 1800);

    expect(scannedPrice()).toEqual({ kind: "no_price", productName: "Yerba" });
  });

  it("is the one with the highest version when two start at the same moment", () => {
    addPrice("p1", "2026-09-15T00:00:00.000Z", 1200, { id: "a", version: 2 });
    addPrice("p1", "2026-09-15T00:00:00.000Z", 1250, { id: "b", version: 3 });
    addPrice("p1", "2026-09-15T00:00:00.000Z", 1100, { id: "c", version: 1 });

    expect(scannedPrice()).toMatchObject({ listUnitPrice: 1250 });
  });

  it("is the one with the highest id when two of the same version start at the same moment", () => {
    addPrice("p1", "2026-09-15T00:00:00.000Z", 1200, { id: "a" });
    addPrice("p1", "2026-09-15T00:00:00.000Z", 1250, { id: "b" });

    expect(scannedPrice()).toMatchObject({ listUnitPrice: 1250 });
  });
});

describe("the sale being built", () => {
  beforeEach(() => {
    readySeller();
    addProduct("111");
    addProduct("222", { id: "p2", name: "Azucar" });
    addProduct("333", { id: "p3", name: "Fideos" });
    for (const id of ["p1", "p2", "p3"]) {
      addPrice(id, "2026-09-01T00:00:00.000Z", 1000);
    }
  });

  it("is recorded open with the register and the session it was started on", () => {
    scan("111");

    expect(
      database
        .prepare(
          "SELECT register_id, device_id, session_id, actor_id, state, occurred_at FROM sales",
        )
        .all(),
    ).toEqual([
      {
        register_id: "register-1",
        device_id: "device-1",
        session_id: "session-1",
        actor_id: "u1",
        state: "OPEN",
        occurred_at: "2026-09-30T12:00:00.000Z",
      },
    ]);
  });

  it("keeps its lines in the order they were first scanned", () => {
    scan("333");
    scan("111");
    scan("222");
    scan("111");

    const outcome = currentSale({ ledger }, { actorId: "u1" });

    expect(outcome.kind === "open" && outcome.sale.lines.map((line) => line.productId)).toEqual([
      "p3",
      "p1",
      "p2",
    ]);
  });

  it("raises the quantity of a line already scanned and its total", () => {
    scan("111");
    scan("111");
    scan("111");

    expect(database.prepare("SELECT quantity, line_total FROM sale_lines").all()).toEqual([
      { quantity: 3, line_total: 3000 },
    ]);
  });

  it("is refused by the database when a second one is opened on the same session", () => {
    scan("111");

    expect(() =>
      ledger.transaction((tx) =>
        tx.recordOpenedSale({
          id: "another",
          registerId: "register-1",
          deviceId: "device-1",
          sessionId: "session-1",
          actorId: "u1",
          state: "OPEN",
          occurredAt: NOW,
        }),
      ),
    ).toThrow(/UNIQUE/);
  });

  it("is not the current one once it was completed", () => {
    scan("111");
    database.prepare("UPDATE sales SET state = 'COMPLETED'").run();

    expect(currentSale({ ledger }, { actorId: "u1" })).toEqual({ kind: "no_sale" });
  });

  it("leaves nothing behind when a write fails midway", () => {
    scan("111");

    expect(() =>
      ledger.transaction((tx) => {
        tx.recordSaleLine("id-1", {
          id: "new-line",
          productId: "p2",
          productName: "Azucar",
          quantity: 1,
          listUnitPrice: 1000,
          priceListId: "list-1",
          lineTotal: 1000,
        });
        throw new Error("boom");
      }),
    ).toThrow("boom");
    expect(database.prepare("SELECT count(*) AS total FROM sale_lines").get()).toEqual({
      total: 1,
    });
  });

  it("goes nowhere near the outbox", () => {
    scan("111");

    expect(database.prepare("SELECT count(*) AS total FROM outbox").get()).toEqual({ total: 0 });
  });
});

describe("the sale after the register restarts", () => {
  it("is still open with its lines", () => {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-sales-"));
    try {
      const path = join(folder, "register.sqlite");
      database.close();
      database = openLocalDatabase(path, LOCAL_MIGRATIONS);
      ledger = new SqliteSaleLedger(database, new SqliteSignInStore(database));
      readySeller();
      addProduct("111");
      addPrice("p1", "2026-09-01T00:00:00.000Z", 1000);
      scan("111");
      scan("111");
      database.close();

      database = openLocalDatabase(path, LOCAL_MIGRATIONS);
      ledger = new SqliteSaleLedger(database, new SqliteSignInStore(database));

      expect(currentSale({ ledger }, { actorId: "u1" })).toMatchObject({
        kind: "open",
        sale: {
          lines: [
            {
              productId: "p1",
              productName: "Yerba",
              quantity: 2,
              listUnitPrice: 1000,
              priceListId: "list-1",
              lineTotal: 2000,
            },
          ],
        },
      });
    } finally {
      database.close();
      rmSync(folder, { recursive: true, force: true });
      database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS);
    }
  });
});

describe("the installation's revocation", () => {
  it("is not recorded on an installation nobody revoked", () => {
    expect(ledger.transaction((tx) => tx.installationRevoked())).toBe(false);
  });

  it("is read from what the installation recorded", () => {
    database
      .prepare("UPDATE sync_state SET installation_revoked_at = '2026-09-30T11:00:00.000Z'")
      .run();

    expect(ledger.transaction((tx) => tx.installationRevoked())).toBe(true);
  });
});
