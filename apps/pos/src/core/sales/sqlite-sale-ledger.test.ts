import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  FICTIONAL_CUIT,
  FICTIONAL_GROSS_INCOME_REGISTRATION,
  FICTIONAL_LEGAL_NAME,
} from "@purosur/domain/fiscal/test-support";
import { closeCashSession } from "@purosur/domain/register/use-cases";
import {
  addScannedProduct,
  cancelSale,
  changeLineQuantity,
  chargeSaleInCash,
  currentSale,
  removeSaleLine,
} from "@purosur/domain/sales/use-cases";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SqliteSignInStore } from "../access/sqlite-sign-in-store";
import { type LocalDatabase, openLocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { cashBalanceFor } from "../register/cash-session-requests";
import { SqliteCashLedger } from "../register/sqlite-cash-ledger";
import { SqliteSaleLedger } from "./sqlite-sale-ledger";

const NOW = new Date("2026-09-30T12:00:00.000Z");
const CHAIN_KEY = Buffer.from("0123456789abcdef0123456789abcdef").toString("base64");

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
  categoryId?: string;
  active?: boolean;
  removed?: boolean;
}

function addProduct(code: string | undefined, options: ProductOptions = {}): string {
  const id = options.id ?? "p1";
  database
    .prepare(
      `INSERT INTO products (id, name, category_id, sale_unit, active, version, removed)
       VALUES (?, ?, ?, ?, ?, 1, ?)`,
    )
    .run(
      id,
      options.name ?? "Yerba",
      options.categoryId ?? "c",
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

function addCategory(id: string, parentId: string | null = null): void {
  database
    .prepare("INSERT INTO categories (id, name, parent_id, version) VALUES (?, ?, ?, 1)")
    .run(id, id, parentId);
}

function addProductTag(productId: string, tagId: string, active = true): void {
  database
    .prepare("INSERT INTO product_tags (product_id, tag_id, active) VALUES (?, ?, ?)")
    .run(productId, tagId, active ? 1 : 0);
}

type Benefit =
  | { kind: "PERCENT_OFF"; percent: number }
  | { kind: "BUY_N_PAY_M"; buyQty: number; payQty: number };

interface DiscountOptions {
  active?: boolean;
  removed?: boolean;
  validFrom?: string;
  validTo?: string;
  weekdays?: number[];
}

function addDiscount(
  id: string,
  target: { kind: "PRODUCT" | "CATEGORY" | "TAG"; id: string },
  benefit: Benefit,
  options: DiscountOptions = {},
): void {
  database
    .prepare(
      `INSERT INTO discounts (
         id, name, kind, percent, buy_qty, pay_qty, target_kind, target_id, valid_from, valid_to,
         weekdays, active, version, removed
       ) VALUES (
         @id, 'Promo', @kind, @percent, @buy_qty, @pay_qty, @target_kind, @target_id, @valid_from,
         @valid_to, @weekdays, @active, 1, @removed
       )`,
    )
    .run({
      id,
      kind: benefit.kind,
      percent: benefit.kind === "PERCENT_OFF" ? benefit.percent : null,
      buy_qty: benefit.kind === "BUY_N_PAY_M" ? benefit.buyQty : null,
      pay_qty: benefit.kind === "BUY_N_PAY_M" ? benefit.payQty : null,
      target_kind: target.kind,
      target_id: target.id,
      valid_from: options.validFrom ?? "2026-09-01",
      valid_to: options.validTo ?? "2026-12-31",
      weekdays: JSON.stringify(options.weekdays ?? []),
      active: options.active === false ? 0 : 1,
      removed: options.removed ? 1 : 0,
    });
}

function promotionIdsTargeting(productId: string): string[] {
  return ledger
    .transaction((tx) => tx.promotionsTargeting(productId))
    .map((promotion) => promotion.id);
}

function saveThreshold(id: string, amount: number, validFrom: string): void {
  database
    .prepare(
      "INSERT INTO buyer_identification_thresholds (id, amount, valid_from) VALUES (?, ?, ?)",
    )
    .run(id, amount, validFrom);
}

function readySeller(): void {
  addCashier();
  enrol();
  openSession();
  saveThreshold("threshold-1", 100_000_000, "2026-01-01");
}

beforeEach(() => {
  idCount = 0;
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS);
  ledger = new SqliteSaleLedger(database, new SqliteSignInStore(database), CHAIN_KEY);
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

  it("is the one with the greater id when two start at the same moment, whatever their versions", () => {
    addPrice("p1", "2026-09-15T00:00:00.000Z", 1100, {
      id: "00000000-0000-4000-8000-000000000001",
      version: 3,
    });
    addPrice("p1", "2026-09-15T00:00:00.000Z", 1250, {
      id: "00000000-0000-4000-8000-000000000002",
      version: 1,
    });

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

    const outcome = currentSale({ ledger, clock: { now: () => NOW } }, { actorId: "u1" });

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

    expect(currentSale({ ledger, clock: { now: () => NOW } }, { actorId: "u1" })).toEqual({
      kind: "no_sale",
    });
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
          promotions: [],
          promotionId: null,
          discountAmount: 0,
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
      ledger = new SqliteSaleLedger(database, new SqliteSignInStore(database), CHAIN_KEY);
      readySeller();
      addProduct("111");
      addPrice("p1", "2026-09-01T00:00:00.000Z", 1000);
      scan("111");
      scan("111");
      database.close();

      database = openLocalDatabase(path, LOCAL_MIGRATIONS);
      ledger = new SqliteSaleLedger(database, new SqliteSignInStore(database), CHAIN_KEY);

      expect(currentSale({ ledger, clock: { now: () => NOW } }, { actorId: "u1" })).toMatchObject({
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

describe("the buyer-identification thresholds", () => {
  it("are none until the register receives one", () => {
    expect(ledger.transaction((tx) => tx.buyerIdentificationThresholds())).toEqual([]);
  });

  it("are every one the register holds, past and scheduled", () => {
    saveThreshold("t2", 12_000_000, "2026-10-15");
    saveThreshold("t1", 10_000_000, "2026-01-01");

    const thresholds = ledger.transaction((tx) => tx.buyerIdentificationThresholds());

    expect(thresholds).toHaveLength(2);
    expect(thresholds).toEqual(
      expect.arrayContaining([
        { id: "t1", amount: 10_000_000, validFrom: "2026-01-01" },
        { id: "t2", amount: 12_000_000, validFrom: "2026-10-15" },
      ]),
    );
  });
});

describe("charging an open sale in cash", () => {
  beforeEach(() => {
    readySeller();
    addProduct("111");
    addPrice("p1", "2026-09-01T00:00:00.000Z", 1500);
    database
      .prepare(
        `INSERT INTO issuer_identification_versions (
           version, legal_name, gross_income_registration, activity_start_date, authorized_cuit, tax_status
         ) VALUES (1, ?, ?, '2020-01-15', ?, 'Condicion de prueba')`,
      )
      .run(FICTIONAL_LEGAL_NAME, FICTIONAL_GROSS_INCOME_REGISTRATION, FICTIONAL_CUIT);
    database
      .prepare(
        "INSERT INTO buyer_tax_status_sets (params_version, set_id, options) VALUES (1, 'set-1', ?)",
      )
      .run(JSON.stringify([{ code: 90, description: "Consumidor Final", invoice_class: "A/M/C" }]));
  });

  function sellTwo(): string {
    scan("111");
    const outcome = scan("111");
    if (outcome.kind !== "added") {
      throw new Error("test setup: the product was not added");
    }
    return outcome.sale.id;
  }

  function charge(saleId: string, tendered: number) {
    return chargeSaleInCash(
      { ledger, clock: { now: () => NOW }, ids },
      { actorId: "u1", saleId, tendered },
    );
  }

  it("completes the sale and stores the payment with what was tendered and applied", () => {
    const saleId = sellTwo();

    expect(charge(saleId, 5000)).toMatchObject({ kind: "completed", change: 2000 });

    expect(database.prepare("SELECT id, state FROM sales").all()).toEqual([
      { id: saleId, state: "COMPLETED" },
    ]);
    expect(
      database
        .prepare(
          "SELECT sale_id, kind, method, provider, amount, tendered, state, occurred_at FROM payment_transactions",
        )
        .all(),
    ).toEqual([
      {
        sale_id: saleId,
        kind: "SALE",
        method: "CASH",
        provider: "NONE",
        amount: 3000,
        tendered: 5000,
        state: "APPROVED",
        occurred_at: NOW.toISOString(),
      },
    ]);
  });

  it("stores the cash that came in and the change that went out against the sale", () => {
    const saleId = sellTwo();

    charge(saleId, 5000);

    expect(
      database
        .prepare(
          "SELECT type, amount, ref_type, ref_id, actor_id FROM cash_movements ORDER BY rowid",
        )
        .all(),
    ).toEqual([
      { type: "SALE", amount: 5000, ref_type: "sale", ref_id: saleId, actor_id: "u1" },
      { type: "CHANGE", amount: 2000, ref_type: "sale", ref_id: saleId, actor_id: "u1" },
    ]);
  });

  it("stores no change movement when the sale was paid exactly", () => {
    const saleId = sellTwo();

    charge(saleId, 3000);

    expect(database.prepare("SELECT type, amount FROM cash_movements").all()).toEqual([
      { type: "SALE", amount: 3000 },
    ]);
  });

  it("appends the sale_completed event to the outbox and advances the chain", () => {
    const saleId = sellTwo();

    charge(saleId, 5000);

    expect(
      database
        .prepare("SELECT device_seq, aggregate_type, aggregate_id, event_type FROM outbox")
        .all(),
    ).toEqual([
      {
        device_seq: 1,
        aggregate_type: "Sale",
        aggregate_id: saleId,
        event_type: "sale_completed",
      },
    ]);
    expect(database.prepare("SELECT last_device_seq FROM sync_state").get()).toEqual({
      last_device_seq: 1,
    });
  });

  it("leaves the sale no longer in progress, so the next scan starts another sale", () => {
    const saleId = sellTwo();
    charge(saleId, 3000);

    const next = scan("111");

    expect(next).toMatchObject({ kind: "added" });
    expect(next.kind === "added" && next.sale.id).not.toBe(saleId);
    expect(database.prepare("SELECT count(*) AS total FROM sales").get()).toEqual({ total: 2 });
  });

  it("adds the tendered cash less the change to what the session expects in the drawer", () => {
    const saleId = sellTwo();

    charge(saleId, 5000);

    expect(cashBalanceFor(database)).toMatchObject({
      cash_sales: 5000,
      change_given: 2000,
      expected: 3000,
    });
  });

  it("lets the session close once the sale is completed", () => {
    const saleId = sellTwo();
    charge(saleId, 3000);

    const closed = closeCashSession(
      {
        ledger: new SqliteCashLedger(database, new SqliteSignInStore(database), CHAIN_KEY),
        clock: { now: () => NOW },
        ids,
      },
      { sessionId: "session-1", closerId: "u1", authorizedBy: null, countedCash: 3000 },
    );

    expect(closed).toMatchObject({ kind: "closed" });
  });

  it("leaves nothing behind when the outbox append fails after the rest was written", () => {
    const saleId = sellTwo();
    database
      .prepare(
        `INSERT INTO outbox (
           event_id, device_id, device_seq, aggregate_type, aggregate_id, event_type, schema_version,
           payload, occurred_at, actor_id, chain_hmac
         ) VALUES ('taken', 'device-1', 1, 'Sale', 'x', 'sale_completed', 1, '{}', '2026-09-30T12:00:00.000Z', 'u1', 'h')`,
      )
      .run();

    expect(() => charge(saleId, 5000)).toThrow();

    expect(database.prepare("SELECT state FROM sales").all()).toEqual([{ state: "OPEN" }]);
    expect(database.prepare("SELECT count(*) AS total FROM payment_transactions").get()).toEqual({
      total: 0,
    });
    expect(database.prepare("SELECT count(*) AS total FROM cash_movements").get()).toEqual({
      total: 0,
    });
    expect(database.prepare("SELECT count(*) AS total FROM outbox").get()).toEqual({ total: 1 });
    expect(database.prepare("SELECT last_device_seq FROM sync_state").get()).toEqual({
      last_device_seq: 0,
    });
  });

  it("refuses to complete a sale that is not in progress", () => {
    const saleId = sellTwo();
    charge(saleId, 3000);

    expect(() => ledger.transaction((tx) => tx.recordCompletedSale(saleId))).toThrow();
    expect(() => ledger.transaction((tx) => tx.recordCompletedSale("missing"))).toThrow();
  });
});

describe("a ledger given no outbox chain key", () => {
  it("refuses to append an outbox event", () => {
    const keyless = new SqliteSaleLedger(database, new SqliteSignInStore(database));

    expect(() =>
      keyless.transaction((tx) =>
        tx.appendOutboxEvent({
          event_id: "event-1",
          aggregate_type: "Sale",
          aggregate_id: "sale-1",
          event_type: "sale_completed",
          schema_version: 1,
          payload: {},
          occurred_at: NOW.toISOString(),
          actor_id: "u1",
        }),
      ),
    ).toThrow();
  });
});

function addSale(id: string, state: string, productIds: string[], registerId = "register-1"): void {
  database
    .prepare(
      `INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at)
       VALUES (?, ?, 'device-1', 'session-1', 'u1', ?, '2026-09-30T09:00:00.000Z')`,
    )
    .run(id, registerId, state);
  productIds.forEach((productId, index) => {
    database
      .prepare(
        `INSERT INTO sale_lines (id, sale_id, position, product_id, product_name, quantity, list_unit_price, price_list_id, line_total)
         VALUES (?, ?, ?, ?, 'any', 1, 100, 'list-1', 100)`,
      )
      .run(`${id}-line-${index}`, id, index + 1, productId);
  });
}

function searchable() {
  return ledger.transaction((tx) => tx.searchableProducts());
}

describe("the products a name search looks through", () => {
  beforeEach(readySeller);

  it("are the active products that were not removed, with their sale unit", () => {
    addProduct(undefined, { id: "p1", name: "Yerba" });
    addProduct(undefined, { id: "p2", name: "Queso", unit: "KG" });
    addProduct(undefined, { id: "p3", name: "Retirado", active: false });
    addProduct(undefined, { id: "p4", name: "Borrado", removed: true });

    expect(searchable()).toEqual([
      { id: "p1", name: "Yerba", saleUnit: "UNIT", timesSoldHere: 0 },
      { id: "p2", name: "Queso", saleUnit: "KG", timesSoldHere: 0 },
    ]);
  });

  it("count the completed sales of this register that contain them, once per sale", () => {
    addProduct(undefined, { id: "p1" });
    addProduct(undefined, { id: "p2", name: "Azucar" });
    addSale("s1", "COMPLETED", ["p1", "p2"]);
    addSale("s2", "COMPLETED", ["p1"]);

    expect(searchable().map(({ id, timesSoldHere }) => [id, timesSoldHere])).toEqual([
      ["p1", 2],
      ["p2", 1],
    ]);
  });

  it.each([
    ["an open sale", "OPEN", "register-1"],
    ["a cancelled sale", "CANCELLED", "register-1"],
    ["a voided sale", "VOIDED", "register-1"],
    ["a completed sale of another register", "COMPLETED", "register-2"],
  ])("do not count %s", (_case, state, registerId) => {
    addProduct(undefined, { id: "p1" });
    addSale("s1", state, ["p1"], registerId);

    expect(searchable().map((product) => product.timesSoldHere)).toEqual([0]);
  });

  it("count nothing while the register has no identity yet", () => {
    addProduct(undefined, { id: "p1" });
    addSale("s1", "COMPLETED", ["p1"]);
    database.prepare("DELETE FROM own_register").run();

    expect(searchable().map((product) => product.timesSoldHere)).toEqual([0]);
  });
});

describe("reading an active product by its id", () => {
  beforeEach(readySeller);

  function byId(id: string) {
    return ledger.transaction((tx) => tx.activeProductById(id));
  }

  it("finds it with its name and sale unit", () => {
    addProduct(undefined, { id: "p2", name: "Queso", unit: "KG" });

    expect(byId("p2")).toEqual({ id: "p2", name: "Queso", saleUnit: "KG" });
  });

  it.each([
    ["an inactive product", { active: false }],
    ["a removed product", { removed: true }],
  ])("does not find %s", (_case, options) => {
    addProduct(undefined, { id: "p2", ...options });

    expect(byId("p2")).toBeUndefined();
  });

  it("does not find an id no product has", () => {
    expect(byId("missing")).toBeUndefined();
  });
});

describe("the promotions that target a product", () => {
  const tenPercent: Benefit = { kind: "PERCENT_OFF", percent: 10 };

  beforeEach(() => {
    addCategory("root");
    addCategory("middle", "root");
    addCategory("c", "middle");
    addProduct("111");
  });

  it("are the ones aimed at the product itself", () => {
    addDiscount("d1", { kind: "PRODUCT", id: "p1" }, tenPercent);

    expect(promotionIdsTargeting("p1")).toEqual(["d1"]);
  });

  it("are the ones aimed at its category and at every category above it", () => {
    addDiscount("own", { kind: "CATEGORY", id: "c" }, tenPercent);
    addDiscount("parent", { kind: "CATEGORY", id: "middle" }, tenPercent);
    addDiscount("grandparent", { kind: "CATEGORY", id: "root" }, tenPercent);

    expect(promotionIdsTargeting("p1")).toEqual(["grandparent", "own", "parent"]);
  });

  it("do not include the ones aimed at a category below or beside its own", () => {
    addCategory("child", "c");
    addCategory("sibling", "middle");
    addDiscount("below", { kind: "CATEGORY", id: "child" }, tenPercent);
    addDiscount("beside", { kind: "CATEGORY", id: "sibling" }, tenPercent);

    expect(promotionIdsTargeting("p1")).toEqual([]);
  });

  it("are the ones aimed at its active tags, and not at an inactive one", () => {
    addProductTag("p1", "on");
    addProductTag("p1", "off", false);
    addDiscount("active-tag", { kind: "TAG", id: "on" }, tenPercent);
    addDiscount("inactive-tag", { kind: "TAG", id: "off" }, tenPercent);

    expect(promotionIdsTargeting("p1")).toEqual(["active-tag"]);
  });

  it("still include the ones aimed at a tag the product carries after that tag is deactivated", () => {
    database
      .prepare(
        "INSERT INTO tags (id, name, active, version) VALUES ('gluten-free', 'Sin TACC', 0, 2)",
      )
      .run();
    addProductTag("p1", "gluten-free");
    addDiscount("deactivated-tag", { kind: "TAG", id: "gluten-free" }, tenPercent);

    expect(promotionIdsTargeting("p1")).toEqual(["deactivated-tag"]);
  });

  it("leave out a removed promotion and one aimed at another product", () => {
    addProduct("222", { id: "p2", name: "Azucar" });
    addDiscount("removed", { kind: "PRODUCT", id: "p1" }, tenPercent, { removed: true });
    addDiscount("other", { kind: "PRODUCT", id: "p2" }, tenPercent);

    expect(promotionIdsTargeting("p1")).toEqual([]);
  });

  it("carry their benefit and schedule whatever the day, leaving validity to the domain", () => {
    addDiscount(
      "percent",
      { kind: "PRODUCT", id: "p1" },
      { kind: "PERCENT_OFF", percent: 15 },
      { active: false, validFrom: "2025-01-01", validTo: "2025-01-31", weekdays: [1, 3] },
    );
    addDiscount(
      "buy",
      { kind: "PRODUCT", id: "p1" },
      { kind: "BUY_N_PAY_M", buyQty: 3, payQty: 2 },
    );

    expect(ledger.transaction((tx) => tx.promotionsTargeting("p1"))).toEqual([
      {
        id: "buy",
        benefit: { kind: "BUY_N_PAY_M", buyQty: 3, payQty: 2 },
        active: true,
        validFrom: "2026-09-01",
        validTo: "2026-12-31",
        weekdays: [],
      },
      {
        id: "percent",
        benefit: { kind: "PERCENT_OFF", percent: 15 },
        active: false,
        validFrom: "2025-01-01",
        validTo: "2025-01-31",
        weekdays: [1, 3],
      },
    ]);
  });
});

describe("a line's promotions", () => {
  beforeEach(() => {
    readySeller();
    addProduct("111");
    addPrice("p1", "2026-09-01T00:00:00.000Z", 1000);
    addDiscount("ten", { kind: "PRODUCT", id: "p1" }, { kind: "PERCENT_OFF", percent: 10 });
    addDiscount(
      "three-for-two",
      { kind: "PRODUCT", id: "p1" },
      { kind: "BUY_N_PAY_M", buyQty: 3, payQty: 2 },
    );
  });

  it("are frozen with the line and read back after the sale is reopened", () => {
    scan("111");

    const outcome = currentSale({ ledger, clock: { now: () => NOW } }, { actorId: "u1" });

    expect(outcome.kind === "open" && outcome.sale.lines[0]).toMatchObject({
      promotions: [
        { id: "ten", benefit: { kind: "PERCENT_OFF", percent: 10 } },
        { id: "three-for-two", benefit: { kind: "BUY_N_PAY_M", buyQty: 3, payQty: 2 } },
      ],
      promotionId: "ten",
      discountAmount: 100,
      lineTotal: 900,
    });
  });

  it("keep the frozen set when the catalog changes their promotions afterwards", () => {
    scan("111");
    database.prepare("UPDATE discounts SET removed = 1 WHERE id = 'ten'").run();
    addDiscount("late", { kind: "PRODUCT", id: "p1" }, { kind: "PERCENT_OFF", percent: 50 });

    scan("111");
    const outcome = currentSale({ ledger, clock: { now: () => NOW } }, { actorId: "u1" });

    expect(
      outcome.kind === "open" && outcome.sale.lines[0]?.promotions.map((promotion) => promotion.id),
    ).toEqual(["ten", "three-for-two"]);
  });

  it("switch the applied promotion, and the discount charged, as the quantity grows", () => {
    const appliedAfterEachScan = [1, 2, 3].map(() => {
      scan("111");
      return database
        .prepare("SELECT quantity, promotion_id, discount_amount, line_total FROM sale_lines")
        .get();
    });

    expect(appliedAfterEachScan).toEqual([
      { quantity: 1, promotion_id: "ten", discount_amount: 100, line_total: 900 },
      { quantity: 2, promotion_id: "ten", discount_amount: 200, line_total: 1800 },
      { quantity: 3, promotion_id: "three-for-two", discount_amount: 1000, line_total: 2000 },
    ]);
  });

  it("are not stored for a product nothing targets", () => {
    addProduct("222", { id: "p2", name: "Azucar" });
    addPrice("p2", "2026-09-01T00:00:00.000Z", 500);

    scan("222");

    expect(database.prepare("SELECT count(*) AS total FROM sale_line_promotions").get()).toEqual({
      total: 0,
    });
    expect(database.prepare("SELECT promotion_id, discount_amount FROM sale_lines").all()).toEqual([
      { promotion_id: null, discount_amount: 0 },
    ]);
  });
});

describe("the lines of the sale being changed", () => {
  const sellerPorts = () => ({ ledger, clock: { now: () => NOW }, ids });

  beforeEach(() => {
    readySeller();
    addProduct("111");
    addProduct("222", { id: "p2", name: "Azucar" });
    addPrice("p1", "2026-09-01T00:00:00.000Z", 1000);
    addPrice("p2", "2026-09-01T00:00:00.000Z", 500);
    addDiscount("ten", { kind: "PRODUCT", id: "p1" }, { kind: "PERCENT_OFF", percent: 10 });
  });

  function lineIdOf(productId: string): string {
    return (
      database
        .prepare<[string], { id: string }>("SELECT id FROM sale_lines WHERE product_id = ?")
        .get(productId) as { id: string }
    ).id;
  }

  it("keeps the new quantity and total and records what a lowered quantity took away", () => {
    scan("111");
    scan("111");
    scan("111");

    changeLineQuantity(sellerPorts(), {
      actorId: "u1",
      lineId: lineIdOf("p1"),
      quantity: 1,
      expectedQuantity: 3,
    });

    expect(database.prepare("SELECT quantity, line_total FROM sale_lines").all()).toEqual([
      { quantity: 1, line_total: 900 },
    ]);
    expect(
      database
        .prepare(
          `SELECT sale_id, product_id, qty_removed, amount_removed, actor_id, occurred_at
           FROM sale_line_removals`,
        )
        .all(),
    ).toEqual([
      {
        sale_id: "id-1",
        product_id: "p1",
        qty_removed: 2,
        amount_removed: 1800,
        actor_id: "u1",
        occurred_at: "2026-09-30T12:00:00.000Z",
      },
    ]);
  });

  it("refuses a lowering computed before a scan raised the line, keeping the scanned unit", () => {
    scan("111");
    scan("111");
    const lineId = lineIdOf("p1");
    scan("111");

    const outcome = changeLineQuantity(sellerPorts(), {
      actorId: "u1",
      lineId,
      quantity: 1,
      expectedQuantity: 2,
    });

    expect(outcome).toEqual({ kind: "stale_quantity" });
    expect(database.prepare("SELECT quantity, line_total FROM sale_lines").all()).toEqual([
      { quantity: 3, line_total: 2700 },
    ]);
    expect(database.prepare("SELECT count(*) AS total FROM sale_line_removals").get()).toEqual({
      total: 0,
    });
  });

  it("lowers a quantity whose line total rises, storing a negative removed amount", () => {
    addDiscount(
      "three-for-one",
      { kind: "PRODUCT", id: "p1" },
      { kind: "BUY_N_PAY_M", buyQty: 3, payQty: 1 },
    );
    scan("111");
    scan("111");
    scan("111");

    changeLineQuantity(sellerPorts(), {
      actorId: "u1",
      lineId: lineIdOf("p1"),
      quantity: 2,
      expectedQuantity: 3,
    });

    expect(database.prepare("SELECT quantity, line_total FROM sale_lines").all()).toEqual([
      { quantity: 2, line_total: 1800 },
    ]);
    expect(
      database.prepare("SELECT qty_removed, amount_removed FROM sale_line_removals").all(),
    ).toEqual([{ qty_removed: 1, amount_removed: -800 }]);
  });

  it("records nothing when the quantity is raised", () => {
    scan("111");

    changeLineQuantity(sellerPorts(), {
      actorId: "u1",
      lineId: lineIdOf("p1"),
      quantity: 4,
      expectedQuantity: 1,
    });

    expect(database.prepare("SELECT count(*) AS total FROM sale_line_removals").get()).toEqual({
      total: 0,
    });
  });

  it("deletes a removed line with its frozen promotions and records the whole line as removed", () => {
    scan("111");
    scan("111");
    scan("222");
    const removedLine = lineIdOf("p1");

    removeSaleLine(sellerPorts(), { actorId: "u1", lineId: removedLine });

    expect(database.prepare("SELECT product_id FROM sale_lines").all()).toEqual([
      { product_id: "p2" },
    ]);
    expect(database.prepare("SELECT count(*) AS total FROM sale_line_promotions").get()).toEqual({
      total: 0,
    });
    expect(
      database
        .prepare(
          "SELECT sale_line_id, product_id, qty_removed, amount_removed FROM sale_line_removals",
        )
        .all(),
    ).toEqual([
      { sale_line_id: removedLine, product_id: "p1", qty_removed: 2, amount_removed: 1800 },
    ]);
  });

  it("keeps the removal of a line that no longer exists", () => {
    scan("111");

    removeSaleLine(sellerPorts(), { actorId: "u1", lineId: lineIdOf("p1") });

    expect(database.prepare("SELECT count(*) AS total FROM sale_line_removals").get()).toEqual({
      total: 1,
    });
  });

  it("is refused by the database for a removal that takes nothing away", () => {
    scan("111");

    expect(() =>
      ledger.transaction((tx) =>
        tx.recordLineRemoval({
          id: "r1",
          saleId: "id-1",
          saleLineId: "l",
          productId: "p1",
          qtyRemoved: 0,
          amountRemoved: 0,
          actorId: "u1",
          occurredAt: NOW,
        }),
      ),
    ).toThrow(/CHECK/);
  });

  it("reads back the removals of a sale in the order they were made", () => {
    scan("111");
    scan("111");
    scan("222");
    changeLineQuantity(sellerPorts(), {
      actorId: "u1",
      lineId: lineIdOf("p1"),
      quantity: 1,
      expectedQuantity: 2,
    });
    removeSaleLine(sellerPorts(), { actorId: "u1", lineId: lineIdOf("p2") });

    const removals = ledger.transaction((tx) => tx.saleLineRemovals("id-1"));

    expect(removals.map((removal) => [removal.productId, removal.qtyRemoved])).toEqual([
      ["p1", 1],
      ["p2", 1],
    ]);
  });

  it("cancels the sale and chains one sale_cancelled event with its lines and removals", () => {
    scan("111");
    scan("222");
    removeSaleLine(sellerPorts(), { actorId: "u1", lineId: lineIdOf("p2") });

    const outcome = cancelSale(sellerPorts(), { actorId: "u1", from: "sale" });

    expect(outcome.kind).toBe("cancelled");
    expect(database.prepare("SELECT state FROM sales").all()).toEqual([{ state: "CANCELLED" }]);
    const events = database
      .prepare(
        `SELECT event_type, aggregate_id, device_seq, chain_hmac, actor_id, payload FROM outbox`,
      )
      .all() as {
      event_type: string;
      aggregate_id: string;
      device_seq: number;
      chain_hmac: string;
      actor_id: string;
      payload: string;
    }[];
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      event_type: "sale_cancelled",
      aggregate_id: "id-1",
      device_seq: 1,
      actor_id: "u1",
    });
    expect(events[0]?.chain_hmac).toBeTruthy();
    const payload = JSON.parse(events[0]?.payload ?? "");
    expect(payload.lines.map((line: { product_id: string }) => line.product_id)).toEqual(["p1"]);
    expect(payload.removals.map((removal: { product_id: string }) => removal.product_id)).toEqual([
      "p2",
    ]);
  });

  it("reads back the payments it records for a sale", () => {
    scan("111");
    ledger.transaction((tx) =>
      tx.recordPayment({
        id: "payment-1",
        saleId: "id-1",
        kind: "SALE",
        method: "CASH",
        provider: "NONE",
        amount: 1500,
        state: "APPROVED",
        occurredAt: NOW,
      }),
    );

    const payments = ledger.transaction((tx) => tx.salePayments("id-1"));

    expect(payments.map((payment) => payment.id)).toEqual(["payment-1"]);
  });

  it("chains the removals of a sale charged in cash in its sale_completed event", () => {
    scan("111");
    scan("111");
    scan("111");
    scan("222");
    const lowered = lineIdOf("p1");
    const removed = lineIdOf("p2");
    changeLineQuantity(sellerPorts(), {
      actorId: "u1",
      lineId: lowered,
      quantity: 2,
      expectedQuantity: 3,
    });
    removeSaleLine(sellerPorts(), { actorId: "u1", lineId: removed });

    const outcome = chargeSaleInCash(sellerPorts(), {
      actorId: "u1",
      saleId: "id-1",
      tendered: 5000,
    });

    expect(outcome.kind).toBe("completed");
    const event = database.prepare("SELECT event_type, payload FROM outbox").get() as {
      event_type: string;
      payload: string;
    };
    expect(event.event_type).toBe("sale_completed");
    expect(
      JSON.parse(event.payload).removals.map(
        (removal: { sale_line_id: string; qty_removed: number }) => [
          removal.sale_line_id,
          removal.qty_removed,
        ],
      ),
    ).toEqual([
      [lowered, 1],
      [removed, 1],
    ]);
  });

  it("lets the next scan start a new open sale once the previous one is cancelled", () => {
    scan("111");
    cancelSale(sellerPorts(), { actorId: "u1", from: "sale" });

    scan("111");

    expect(database.prepare("SELECT state FROM sales ORDER BY occurred_at, id").all()).toHaveLength(
      2,
    );
    expect(
      database.prepare("SELECT count(*) AS total FROM sales WHERE state = 'OPEN'").get(),
    ).toEqual({ total: 1 });
  });

  it("leaves the sale open and the outbox empty when the event cannot be appended", () => {
    scan("111");
    database.prepare("DELETE FROM sync_state").run();

    expect(() => cancelSale(sellerPorts(), { actorId: "u1", from: "sale" })).toThrow();
    expect(database.prepare("SELECT state FROM sales").all()).toEqual([{ state: "OPEN" }]);
  });

  it("refuses to append an event when the register has no outbox key", () => {
    const keyless = new SqliteSaleLedger(database, new SqliteSignInStore(database));
    scan("111");

    expect(() =>
      cancelSale({ ...sellerPorts(), ledger: keyless }, { actorId: "u1", from: "sale" }),
    ).toThrow(/outbox/);
    expect(database.prepare("SELECT state FROM sales").all()).toEqual([{ state: "OPEN" }]);
  });
});
