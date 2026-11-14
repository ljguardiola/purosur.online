import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { encodePinHash } from "@purosur/contracts";
import {
  FICTIONAL_CUIT,
  FICTIONAL_GROSS_INCOME_REGISTRATION,
  FICTIONAL_LEGAL_NAME,
} from "@purosur/domain/fiscal/test-support";
import {
  type Scale,
  type ScaleReading,
  settleApprovedMercadoPagoPayment,
} from "@purosur/domain/sales/use-cases";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { restorePendingIn } from "../backups/restore-pending";
import { derivePinVerifier } from "../credentials/pin-verifier";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { fixedZoneRulesSource } from "../platform/test-support/fixed-zone-rules-source";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import {
  cashBalanceFor,
  closeCashSessionFor,
  sessionOpenSaleFor,
} from "../register/cash-session-requests";
import { SqliteRestorationEvidence } from "../register/sqlite-restoration-evidence";
import { createActionGate } from "../sessions/action-gate";
import { createSignedInPerson, type SignedInPerson } from "../sessions/signed-in-person";
import { SqliteSignInStore } from "../sessions/sqlite-sign-in-store";
import {
  addSearchedProductFor,
  addWeighedProductFor,
  adjustSaleLineFor,
  applySaleDiscountFor,
  cancelLockedSaleFor,
  cancelPaidSaleFor,
  cancelSaleFor,
  cashChargeFor,
  changeLineQuantityFor,
  changeLineWeightFor,
  chargeSaleByTransferFor,
  chargeSaleInCashFor,
  chargeSaleInCashWithChangeDiscountFor,
  chargeSaleOnStandaloneTerminalFor,
  currentSaleFor,
  findProductByCodeFor,
  nonCashChargeFor,
  type OutboxSaleRequestDeps,
  previewSaleDiscountFor,
  previewSaleLineAdjustmentFor,
  readScaleFor,
  removeSaleLineFor,
  type SellingRequestDeps,
  scanProductFor,
  searchProductsFor,
  weighLineFor,
  weighProductFor,
} from "./sale-requests";
import { anySaleIsOpen } from "./sqlite-open-sale-presence";
import { SqliteSaleLedger } from "./sqlite-sale-ledger";

const NOW = new Date("2026-09-30T12:00:00.000Z");

const PEPPER = Buffer.alloc(32, 7).toString("base64url");
const PIN_HASH = "argon2id$v=19$m=65536,t=3,p=4$c2FsdA$aGFzaC1vZi10aGUtcGlu";
const CLOSER_PIN = "1234";
const CLOSER = { user_id: "u9", pin: CLOSER_PIN };

const CHAIN_KEY = Buffer.from("0123456789abcdef0123456789abcdef").toString("base64");

let database: LocalDatabase;
let signedInPerson: SignedInPerson;

function deps(
  overrides: Partial<OutboxSaleRequestDeps & SellingRequestDeps> = {},
): OutboxSaleRequestDeps & SellingRequestDeps {
  let count = 0;
  return {
    database,
    gate: createActionGate({
      store: new SqliteSignInStore(database),
      signedInPerson,
      readPepper: async () => undefined,
      hashPin: async () => "",
      now: () => NOW,
    }),
    readOutboxChainKey: async () => CHAIN_KEY,
    now: () => NOW,
    ids: {
      next: () => {
        count += 1;
        return `id-${count}`;
      },
    },
    paidOrderDiscovery: () => "checked",
    newSalesStoppedByDisk: () => false,
    localDatabaseDamaged: () => false,
    newSalesStoppedByBattery: () => false,
    restoration: new SqliteRestorationEvidence(
      database,
      restorePendingIn(undefined),
      () => "unknown",
      () => false,
    ),
    zoneRules: fixedZoneRulesSource(),
    ...overrides,
  };
}

function markRegisterStale(): void {
  database
    .prepare("UPDATE sync_state SET stale_sequence_detected_at = '2026-09-30T08:00:00.000Z'")
    .run();
}

function idsStartingWith(prefix: string): OutboxSaleRequestDeps["ids"] {
  let count = 0;
  return {
    next: () => {
      count += 1;
      return `${prefix}-${count}`;
    },
  };
}

function addPerson(id: string, roleId: string): void {
  database
    .prepare(
      "INSERT INTO users (id, first_name, role_id, salt, active, version) VALUES (?, 'Ana', ?, 's', 1, 1)",
    )
    .run(id, roleId);
}

function pinGate() {
  return createActionGate({
    store: new SqliteSignInStore(database),
    signedInPerson,
    readPepper: async () => PEPPER,
    hashPin: async (pin) => (pin === CLOSER_PIN ? PIN_HASH : "hash-of-another-pin"),
    now: () => NOW,
  });
}

function addPersonWithPin(id: string, firstName: string, permissions: string[]): void {
  database
    .prepare(
      `INSERT INTO roles (id, name, is_administrator, version) VALUES ('role-${id}', 'Rol', 0, 1)`,
    )
    .run();
  for (const key of permissions) {
    database
      .prepare(
        `INSERT INTO role_permissions (role_id, permission_key, active) VALUES ('role-${id}', ?, 1)`,
      )
      .run(key);
  }
  database
    .prepare(
      "INSERT INTO users (id, first_name, role_id, salt, active, version) VALUES (?, ?, ?, ?, 1, 1)",
    )
    .run(id, firstName, `role-${id}`, encodePinHash(new Uint8Array(16).fill(1)));
  database
    .prepare("INSERT INTO pin_verifiers (user_id, verifier) VALUES (?, ?)")
    .run(id, derivePinVerifier(PEPPER, PIN_HASH));
}

function saveThreshold(amount: number, validFrom = "2026-01-01", revision = 0): void {
  database
    .prepare(
      "INSERT INTO buyer_identification_thresholds (id, amount, valid_from, revision) VALUES (?, ?, ?, ?)",
    )
    .run(`threshold-starting-${validFrom}-${revision}`, amount, validFrom, revision);
}

function addFiscalConfiguration(): void {
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
    .run(JSON.stringify([{ code: 5, description: "Consumidor Final", invoice_class: "A/M/C" }]));
}

function seed(): void {
  database
    .prepare(
      "INSERT INTO roles (id, name, is_administrator, version) VALUES ('guest', 'Invitada', 0, 1)",
    )
    .run();
  database
    .prepare(
      "INSERT INTO roles (id, name, is_administrator, version) VALUES ('cashier', 'Cajera', 0, 1)",
    )
    .run();
  database
    .prepare(
      "INSERT INTO role_permissions (role_id, permission_key, active) VALUES ('cashier', 'sell_and_charge', 1)",
    )
    .run();
  database
    .prepare(
      "INSERT INTO users (id, first_name, role_id, salt, active, version) VALUES ('u1', 'Ada', 'cashier', 's', 1, 1)",
    )
    .run();
  database
    .prepare("INSERT INTO own_register (id, name, version) VALUES ('register-1', 'Caja 1', 1)")
    .run();
  database.prepare("UPDATE sync_state SET device_id = 'device-1'").run();
  saveThreshold(100_000_000);
  database
    .prepare(
      `INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
       VALUES ('session-1', 'register-1', 'device-1', 'u1', '2026-09-30T08:00:00.000Z', 0, 'OPEN')`,
    )
    .run();
  database
    .prepare(
      "INSERT INTO products (id, name, category_id, sale_unit, active, version) VALUES ('p1', 'Yerba', 'c', 'UNIT', 1, 1)",
    )
    .run();
  database
    .prepare(
      "INSERT INTO product_barcodes (product_id, position, code, active) VALUES ('p1', 1, '111', 1)",
    )
    .run();
  database
    .prepare(
      "INSERT INTO products (id, name, category_id, sale_unit, active, version) VALUES ('p2', 'Queso', 'c', 'KG', 1, 1)",
    )
    .run();
  database
    .prepare(
      "INSERT INTO product_barcodes (product_id, position, code, active) VALUES ('p2', 1, '222', 1)",
    )
    .run();
  database
    .prepare(
      `INSERT INTO prices (id, product_id, price_list_id, unit_price, valid_from, version)
       VALUES ('price-1', 'p1', 'list-1', 1500, '2026-09-01T00:00:00.000Z', 1)`,
    )
    .run();
}

function addSugar(): void {
  database
    .prepare(
      "INSERT INTO products (id, name, category_id, sale_unit, active, version) VALUES ('p3', 'Azucar', 'c', 'UNIT', 1, 1)",
    )
    .run();
  database
    .prepare(
      "INSERT INTO product_barcodes (product_id, position, code, active) VALUES ('p3', 1, '333', 1)",
    )
    .run();
  database
    .prepare(
      `INSERT INTO prices (id, product_id, price_list_id, unit_price, valid_from, version)
       VALUES ('price-3', 'p3', 'list-1', 1200, '2026-09-01T00:00:00.000Z', 1)`,
    )
    .run();
}

function priceCheese(): void {
  database
    .prepare(
      `INSERT INTO prices (id, product_id, price_list_id, unit_price, valid_from, version)
       VALUES ('price-2', 'p2', 'list-1', 9000, '2026-09-01T00:00:00.000Z', 1)`,
    )
    .run();
}

beforeEach(() => {
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
  seed();
  signedInPerson = createSignedInPerson();
  signedInPerson.set("u1");
});

afterEach(() => {
  database.close();
});

describe("scanning a product on the register", () => {
  it("answers the sale with each line as the screen shows it and the total to charge", async () => {
    await scanProductFor(deps(), "111");

    expect(await scanProductFor(deps(), "111")).toEqual({
      kind: "added",
      removed_manual_discount: false,
      removed_sale_discount: false,
      sale: {
        id: "id-1",
        lines: [
          {
            id: "id-2",
            product_id: "p1",
            product_name: "Yerba",
            sale_unit: "UNIT",
            weight_source: null,
            quantity: 2,
            list_unit_price: 1500,
            discount_amount: 0,
            promotion: null,
            manual_adjustment: null,
            line_total: 3000,
          },
        ],
        total: 3000,
        paid: 0,
        pending: 3000,
        payments: [],
        lines_lock: null,
        cancel_refusal: null,
        charge_refusal: null,
        mercado_pago_charge_in_progress: null,
        rebuilt_paid_order: null,
        refunds_on_cancel: [],
        refund_now_on_cancel: 0,
        cancel_authorization_required: true,
        adjust_authorization_required: true,
        sale_discount_authorization_required: true,
        gross_subtotal: 3000,
        subtotal: 3000,
        promotion_savings: 0,
        sale_discount: null,
        sale_discount_refusal: null,
      },
    });
  });

  it.each([
    [
      "a percent",
      { kind: "PERCENT_OFF", percent: 10, buy_qty: null, pay_qty: null },
      1,
      { kind: "PERCENT_OFF", percent: 10 },
      { discount_amount: 150, line_total: 1350 },
    ],
    [
      "a buy N pay M",
      { kind: "BUY_N_PAY_M", percent: null, buy_qty: 3, pay_qty: 2 },
      3,
      { kind: "BUY_N_PAY_M", buy_qty: 3, pay_qty: 2 },
      { discount_amount: 1500, line_total: 3000 },
    ],
  ])(
    "answers the promotion a line was charged with and what it saved the sale: %s",
    async (_case, columns, scans, promotion, charged) => {
      database
        .prepare(
          `INSERT INTO discounts (
           id, name, kind, percent, buy_qty, pay_qty, target_kind, target_id, valid_from, valid_to,
           weekdays, active, version
         ) VALUES ('d1', 'Promo', @kind, @percent, @buy_qty, @pay_qty, 'PRODUCT', 'p1', '2026-09-01', '2026-12-31', '[]', 1, 1)`,
        )
        .run(columns);

      let outcome = await scanProductFor(deps(), "111");
      for (let scan = 1; scan < scans; scan += 1) {
        outcome = await scanProductFor(deps(), "111");
      }

      expect(outcome.kind === "added" && outcome.sale).toMatchObject({
        lines: [{ promotion, ...charged }],
        gross_subtotal: charged.line_total + charged.discount_amount,
        promotion_savings: charged.discount_amount,
      });
    },
  );

  it("answers the name of a product that has no price", async () => {
    database.prepare("DELETE FROM prices").run();

    expect(await scanProductFor(deps(), "111")).toEqual({
      kind: "no_price",
      product_name: "Yerba",
    });
  });

  it("answers the id and name of a product sold by weight, whose weight is still to be typed", async () => {
    priceCheese();

    expect(await scanProductFor(deps(), "222")).toEqual({
      kind: "weight_needed",
      product_id: "p2",
      product_name: "Queso",
    });
    expect(database.prepare("SELECT id FROM sales").all()).toEqual([]);
  });

  it("answers the name of a product whose line may not carry another unit", async () => {
    await scanProductFor(deps(), "111");
    database.prepare("UPDATE sale_lines SET quantity = 2147483").run();

    expect(await scanProductFor(deps(), "111")).toEqual({
      kind: "line_quantity_limit",
      product_name: "Yerba",
    });
  });

  it("answers the domain's refusal of a code no product holds", async () => {
    expect(await scanProductFor(deps(), "999")).toEqual({ kind: "unknown_code" });
  });

  it("answers not signed in when nobody is signed in", async () => {
    signedInPerson.clear();

    expect(await scanProductFor(deps(), "111")).toEqual({ kind: "not_signed_in" });
  });

  it("answers not permitted to a signed-in person without the permission to sell", async () => {
    addPerson("u2", "guest");
    signedInPerson.set("u2");

    expect(await scanProductFor(deps(), "111")).toEqual({ kind: "not_permitted" });
  });

  it("answers that no session is open", async () => {
    database.prepare("UPDATE cash_sessions SET state = 'CLOSED', closed_at = 'x'").run();

    expect(await scanProductFor(deps(), "111")).toEqual({ kind: "no_open_session" });
  });

  it("answers that the installation was revoked when no sale was started", async () => {
    database
      .prepare("UPDATE sync_state SET installation_revoked_at = '2026-09-30T11:00:00.000Z'")
      .run();

    expect(await scanProductFor(deps(), "111")).toEqual({ kind: "installation_revoked" });
  });

  it("answers that the disk stops new sales when no sale was started", async () => {
    expect(await scanProductFor(deps({ newSalesStoppedByDisk: () => true }), "111")).toEqual({
      kind: "disk_space_short",
    });
  });

  it("answers that the local database is damaged when no sale was started", async () => {
    expect(await scanProductFor(deps({ localDatabaseDamaged: () => true }), "111")).toEqual({
      kind: "local_database_damaged",
    });
  });

  it("answers that the battery stops new sales when no sale was started", async () => {
    expect(await scanProductFor(deps({ newSalesStoppedByBattery: () => true }), "111")).toEqual({
      kind: "battery_critical",
    });
  });

  it("answers that this run's paid-order check still waits for the cloud when no sale was started", async () => {
    expect(await scanProductFor(deps({ paidOrderDiscovery: () => "pending" }), "111")).toEqual({
      kind: "paid_orders_not_checked",
    });
  });

  it("answers that the restoration of the register is in progress when no sale was started", async () => {
    markRegisterStale();

    expect(await scanProductFor(deps(), "111")).toEqual({ kind: "restoration_in_progress" });
  });

  it("answers unavailable when the register does not know its own identity yet", async () => {
    database.prepare("DELETE FROM own_register").run();

    expect(await scanProductFor(deps(), "111")).toEqual({ kind: "unavailable" });
  });
});

describe("searching products by name on the register", () => {
  it("answers each product the way the screen shows it, with its price and where the name matched", async () => {
    expect(await searchProductsFor(deps(), "yer")).toEqual({
      kind: "results",
      products: [
        {
          product_id: "p1",
          name: "Yerba",
          sale_unit: "UNIT",
          unit_price: 1500,
          matches: [{ start: 0, length: 3 }],
        },
      ],
      more: false,
    });
  });

  it("answers no price for a product that has none", async () => {
    const outcome = await searchProductsFor(deps(), "queso");

    expect(outcome.kind === "results" && outcome.products).toEqual([
      expect.objectContaining({ product_id: "p2", sale_unit: "KG", unit_price: null }),
    ]);
  });

  it("answers not signed in when nobody is signed in", async () => {
    signedInPerson.clear();

    expect(await searchProductsFor(deps(), "yer")).toEqual({ kind: "not_signed_in" });
  });

  it("answers not permitted to a signed-in person without the permission to sell", async () => {
    addPerson("u2", "guest");
    signedInPerson.set("u2");

    expect(await searchProductsFor(deps(), "yer")).toEqual({ kind: "not_permitted" });
  });

  it("answers that no session is open", async () => {
    database.prepare("UPDATE cash_sessions SET state = 'CLOSED', closed_at = 'x'").run();

    expect(await searchProductsFor(deps(), "yer")).toEqual({ kind: "no_open_session" });
  });
});

describe("finding a product by its code on the register", () => {
  it("answers the product the way the screen shows it, with its price", async () => {
    expect(await findProductByCodeFor(deps(), "111")).toEqual({
      kind: "found",
      product: { product_id: "p1", name: "Yerba", sale_unit: "UNIT", unit_price: 1500 },
    });
  });

  it("answers no price for a product that has none", async () => {
    expect(await findProductByCodeFor(deps(), "222")).toEqual({
      kind: "found",
      product: { product_id: "p2", name: "Queso", sale_unit: "KG", unit_price: null },
    });
  });

  it("answers an unknown code", async () => {
    expect(await findProductByCodeFor(deps(), "999")).toEqual({ kind: "unknown_code" });
  });

  it("answers a code of an inactive product as unknown", async () => {
    database.prepare("UPDATE products SET active = 0 WHERE id = 'p1'").run();

    expect(await findProductByCodeFor(deps(), "111")).toEqual({ kind: "unknown_code" });
  });

  it("does not start a sale", async () => {
    await findProductByCodeFor(deps(), "111");

    expect(database.prepare("SELECT COUNT(*) AS count FROM sales").get()).toEqual({ count: 0 });
  });

  it("answers not signed in when nobody is signed in", async () => {
    signedInPerson.clear();

    expect(await findProductByCodeFor(deps(), "111")).toEqual({ kind: "not_signed_in" });
  });

  it("answers not permitted to a signed-in person without the permission to sell", async () => {
    addPerson("u2", "guest");
    signedInPerson.set("u2");

    expect(await findProductByCodeFor(deps(), "111")).toEqual({ kind: "not_permitted" });
  });

  it("answers that no session is open", async () => {
    database.prepare("UPDATE cash_sessions SET state = 'CLOSED', closed_at = 'x'").run();

    expect(await findProductByCodeFor(deps(), "111")).toEqual({ kind: "no_open_session" });
  });

  it("answers that the restoration of the register is in progress", async () => {
    markRegisterStale();

    expect(await findProductByCodeFor(deps(), "111")).toEqual({ kind: "restoration_in_progress" });
  });
});

describe("adding a searched product on the register", () => {
  it("answers the sale with the product as a line and the total to charge", async () => {
    expect(await addSearchedProductFor(deps(), "p1")).toEqual({
      kind: "added",
      removed_manual_discount: false,
      removed_sale_discount: false,
      sale: {
        id: "id-1",
        lines: [
          {
            id: "id-2",
            product_id: "p1",
            product_name: "Yerba",
            sale_unit: "UNIT",
            weight_source: null,
            quantity: 1,
            list_unit_price: 1500,
            discount_amount: 0,
            promotion: null,
            manual_adjustment: null,
            line_total: 1500,
          },
        ],
        total: 1500,
        paid: 0,
        pending: 1500,
        payments: [],
        lines_lock: null,
        cancel_refusal: null,
        charge_refusal: null,
        mercado_pago_charge_in_progress: null,
        rebuilt_paid_order: null,
        refunds_on_cancel: [],
        refund_now_on_cancel: 0,
        cancel_authorization_required: true,
        adjust_authorization_required: true,
        sale_discount_authorization_required: true,
        gross_subtotal: 1500,
        subtotal: 1500,
        promotion_savings: 0,
        sale_discount: null,
        sale_discount_refusal: null,
      },
    });
  });

  it("answers the name of a product that has no price", async () => {
    database.prepare("DELETE FROM prices").run();

    expect(await addSearchedProductFor(deps(), "p1")).toEqual({
      kind: "no_price",
      product_name: "Yerba",
    });
    expect(await addSearchedProductFor(deps(), "p2")).toEqual({
      kind: "no_price",
      product_name: "Queso",
    });
  });

  it("answers the id and name of a product sold by weight, whose weight is still to be typed", async () => {
    priceCheese();

    expect(await addSearchedProductFor(deps(), "p2")).toEqual({
      kind: "weight_needed",
      product_id: "p2",
      product_name: "Queso",
    });
  });

  it("answers the name of a product whose line may not carry another unit", async () => {
    await addSearchedProductFor(deps(), "p1");
    database.prepare("UPDATE sale_lines SET quantity = 2147483").run();

    expect(await addSearchedProductFor(deps(), "p1")).toEqual({
      kind: "line_quantity_limit",
      product_name: "Yerba",
    });
  });

  it("answers that a product that is not sold any more is unavailable", async () => {
    database.prepare("UPDATE products SET active = 0 WHERE id = 'p1'").run();

    expect(await addSearchedProductFor(deps(), "p1")).toEqual({ kind: "product_unavailable" });
  });

  it("answers not signed in when nobody is signed in", async () => {
    signedInPerson.clear();

    expect(await addSearchedProductFor(deps(), "p1")).toEqual({ kind: "not_signed_in" });
  });

  it("answers not permitted to a signed-in person without the permission to sell", async () => {
    addPerson("u2", "guest");
    signedInPerson.set("u2");

    expect(await addSearchedProductFor(deps(), "p1")).toEqual({ kind: "not_permitted" });
  });

  it("answers the refusal of a session that is not open", async () => {
    database.prepare("UPDATE cash_sessions SET state = 'CLOSED', closed_at = 'x'").run();

    expect(await addSearchedProductFor(deps(), "p1")).toEqual({ kind: "no_open_session" });
  });
});

describe("adding a product sold by weight on the register", () => {
  beforeEach(priceCheese);

  const WEIGHED_LINE = {
    id: "id-2",
    product_id: "p2",
    product_name: "Queso",
    sale_unit: "KG",
    weight_source: "MANUAL",
    quantity: 1250,
    list_unit_price: 9000,
    discount_amount: 0,
    promotion: null,
    manual_adjustment: null,
    line_total: 11250,
  };

  it("answers the sale with the weighed line, priced per kilogram, and the total to charge", async () => {
    expect(await addWeighedProductFor(deps(), "p2", 1250)).toEqual({
      kind: "added",
      removed_manual_discount: false,
      removed_sale_discount: false,
      sale: {
        id: "id-1",
        lines: [WEIGHED_LINE],
        total: 11250,
        paid: 0,
        pending: 11250,
        payments: [],
        lines_lock: null,
        cancel_refusal: null,
        charge_refusal: null,
        mercado_pago_charge_in_progress: null,
        rebuilt_paid_order: null,
        refunds_on_cancel: [],
        refund_now_on_cancel: 0,
        cancel_authorization_required: true,
        adjust_authorization_required: true,
        sale_discount_authorization_required: true,
        gross_subtotal: 11250,
        subtotal: 11250,
        promotion_savings: 0,
        sale_discount: null,
        sale_discount_refusal: null,
      },
    });
  });

  it("keeps the weight in thousandths of a kilogram and records that it was typed", async () => {
    await addWeighedProductFor(deps(), "p2", 1250);

    expect(
      database
        .prepare("SELECT sale_unit, weight_source, quantity, line_total FROM sale_lines")
        .all(),
    ).toEqual([{ sale_unit: "KG", weight_source: "MANUAL", quantity: 1250, line_total: 11250 }]);
  });

  it("holds a product weighed again as another line", async () => {
    await addWeighedProductFor(deps(), "p2", 1250);

    const outcome = await addWeighedProductFor(deps(), "p2", 500);

    expect(outcome.kind === "added" && outcome.sale.lines).toEqual([
      WEIGHED_LINE,
      expect.objectContaining({ product_id: "p2", quantity: 500, line_total: 4500 }),
    ]);
  });

  it("answers the sale in progress with the weighed line", async () => {
    await addWeighedProductFor(deps(), "p2", 1250);

    const sale = await currentSaleFor(deps());

    expect(typeof sale === "object" && sale?.lines).toEqual([WEIGHED_LINE]);
  });

  it.each([
    ["a weight of zero", "p2", 0, { kind: "invalid_weight" }],
    ["a product sold by the unit", "p1", 1000, { kind: "not_sold_by_weight" }],
    ["a product that does not exist", "other", 1000, { kind: "product_unavailable" }],
  ])("answers the domain's refusal of %s", async (_case, productId, weight, expected) => {
    expect(await addWeighedProductFor(deps(), productId, weight)).toEqual(expected);
  });

  it("answers the name of a product that has no price", async () => {
    database.prepare("DELETE FROM prices").run();

    expect(await addWeighedProductFor(deps(), "p2", 1000)).toEqual({
      kind: "no_price",
      product_name: "Queso",
    });
  });

  it("answers that a product that is not sold any more is unavailable", async () => {
    database.prepare("UPDATE products SET active = 0 WHERE id = 'p2'").run();

    expect(await addWeighedProductFor(deps(), "p2", 1000)).toEqual({
      kind: "product_unavailable",
    });
  });

  it("answers not signed in when nobody is signed in", async () => {
    signedInPerson.clear();

    expect(await addWeighedProductFor(deps(), "p2", 1000)).toEqual({ kind: "not_signed_in" });
  });

  it("answers not permitted to a signed-in person without the permission to sell", async () => {
    addPerson("u2", "guest");
    signedInPerson.set("u2");

    expect(await addWeighedProductFor(deps(), "p2", 1000)).toEqual({ kind: "not_permitted" });
  });

  it("answers the refusal of a session that is not open", async () => {
    database.prepare("UPDATE cash_sessions SET state = 'CLOSED', closed_at = 'x'").run();

    expect(await addWeighedProductFor(deps(), "p2", 1000)).toEqual({ kind: "no_open_session" });
  });
});

describe("weighing a product on the scale on the register", () => {
  beforeEach(priceCheese);

  function scaleReading(reading: ScaleReading): Scale {
    return { read: async () => reading };
  }

  function weigh(
    reading: ScaleReading,
    productId = "p2",
    confirmedWeightThousandths: number | null = 1250,
  ) {
    return weighProductFor(
      { ...deps(), scale: scaleReading(reading) },
      productId,
      confirmedWeightThousandths,
    );
  }

  it("answers the sale with the line holding the confirmed stable weight and records the scale as its source", async () => {
    const outcome = await weigh({ kind: "stable", weightThousandths: 1250 });

    expect(outcome).toMatchObject({
      kind: "added",
      removed_manual_discount: false,
      removed_sale_discount: false,
      sale: {
        lines: [
          {
            product_id: "p2",
            sale_unit: "KG",
            weight_source: "SCALE",
            quantity: 1250,
            line_total: 11250,
          },
        ],
        total: 11250,
      },
    });
    expect(database.prepare("SELECT weight_source, quantity FROM sale_lines").all()).toEqual([
      { weight_source: "SCALE", quantity: 1250 },
    ]);
  });

  it("answers the stable weight and its amount, adding no line, when not confirming", async () => {
    expect(await weigh({ kind: "stable", weightThousandths: 1250 }, "p2", null)).toEqual({
      kind: "stable",
      weight_thousandths: 1250,
      amount: 11250,
    });
    expect(database.prepare("SELECT id FROM sale_lines").all()).toEqual([]);
  });

  it("answers a stable weight other than the confirmed one and its amount, adding no line", async () => {
    expect(await weigh({ kind: "stable", weightThousandths: 2500 }, "p2", 1250)).toEqual({
      kind: "stable",
      weight_thousandths: 2500,
      amount: 22500,
    });
    expect(database.prepare("SELECT id FROM sale_lines").all()).toEqual([]);
  });

  it("answers that a weight of zero cannot be taken, adding no line", async () => {
    expect(await weigh({ kind: "stable", weightThousandths: 0 })).toEqual({
      kind: "zero_weight",
    });
    expect(database.prepare("SELECT id FROM sale_lines").all()).toEqual([]);
  });

  it.each([null, 1250])(
    "answers the unstable weight and its amount, adding no line, confirming %s",
    async (confirmed) => {
      expect(await weigh({ kind: "unstable", weightThousandths: 1250 }, "p2", confirmed)).toEqual({
        kind: "unsteady",
        weight_thousandths: 1250,
        amount: 11250,
      });
      expect(database.prepare("SELECT id FROM sale_lines").all()).toEqual([]);
    },
  );

  it("answers an unstable reading that is no line weight as out of range, adding no line", async () => {
    expect(await weigh({ kind: "unstable", weightThousandths: -120 })).toEqual({
      kind: "unsteady_out_of_range",
    });
    expect(database.prepare("SELECT id FROM sale_lines").all()).toEqual([]);
  });

  it("answers weighing and adds no line while the scale is not stable", async () => {
    expect(await weigh({ kind: "not_stable" })).toEqual({ kind: "weighing" });
    expect(database.prepare("SELECT id FROM sale_lines").all()).toEqual([]);
  });

  it("answers that the scale is unavailable", async () => {
    expect(await weigh({ kind: "unavailable" })).toEqual({ kind: "scale_unavailable" });
  });

  it.each([
    ["a product sold by the unit", "p1", { kind: "not_sold_by_weight" }],
    ["a product that does not exist", "other", { kind: "product_unavailable" }],
  ])("answers the domain's refusal of %s", async (_case, productId, expected) => {
    expect(await weigh({ kind: "stable", weightThousandths: 1000 }, productId)).toEqual(expected);
  });

  it("answers the name of a product that has no price", async () => {
    database.prepare("DELETE FROM prices").run();

    expect(await weigh({ kind: "stable", weightThousandths: 1000 })).toEqual({
      kind: "no_price",
      product_name: "Queso",
    });
  });

  it("answers not signed in when nobody is signed in", async () => {
    signedInPerson.clear();

    expect(await weigh({ kind: "stable", weightThousandths: 1000 })).toEqual({
      kind: "not_signed_in",
    });
  });

  it("answers not permitted to a signed-in person without the permission to sell", async () => {
    addPerson("u2", "guest");
    signedInPerson.set("u2");

    expect(await weigh({ kind: "stable", weightThousandths: 1000 })).toEqual({
      kind: "not_permitted",
    });
  });

  it("answers the refusal of a session that is not open", async () => {
    database.prepare("UPDATE cash_sessions SET state = 'CLOSED', closed_at = 'x'").run();

    expect(await weigh({ kind: "stable", weightThousandths: 1000 })).toEqual({
      kind: "no_open_session",
    });
  });
});

describe("reading the scale on the register", () => {
  function read(reading: ScaleReading, standing: { kind: string } = { kind: "matching" }) {
    return readScaleFor({
      scale: { read: async () => reading },
      scaleStanding: () => standing,
    });
  }

  it("answers what the scale shows in the wire's names", async () => {
    expect(await read({ kind: "unstable", weightThousandths: 395 })).toEqual({
      kind: "reading",
      weight_thousandths: 395,
      settled: false,
    });
  });

  it("answers that no scale is configured without reading the scale", async () => {
    const readScale = vi.fn(async (): Promise<ScaleReading> => ({ kind: "unavailable" }));

    const outcome = await readScaleFor({
      scale: { read: readScale },
      scaleStanding: () => ({ kind: "not_registered" }),
    });

    expect(outcome).toEqual({ kind: "not_configured" });
    expect(readScale).not.toHaveBeenCalled();
  });

  it.each(["unknown", "matching", "missing"])(
    "reads the scale when its standing is %s",
    async (kind) => {
      expect(await read({ kind: "stable", weightThousandths: 410 }, { kind })).toEqual({
        kind: "reading",
        weight_thousandths: 410,
        settled: true,
      });
    },
  );
});

describe("changing the weight of a line", () => {
  beforeEach(priceCheese);

  async function sellCheese(): Promise<string> {
    const outcome = await addWeighedProductFor(deps(), "p2", 1000);
    if (outcome.kind !== "added") {
      throw new Error("test setup: the cheese was not added");
    }
    return outcome.sale.lines[0]?.id as string;
  }

  it("answers the sale with the new weight and total", async () => {
    const lineId = await sellCheese();

    const outcome = await changeLineWeightFor(deps(), lineId, 2500, 1000);

    expect(outcome).toMatchObject({
      kind: "changed",
      sale: {
        lines: [
          {
            id: lineId,
            quantity: 2500,
            weight_source: "MANUAL",
            sale_unit: "KG",
            line_total: 22500,
          },
        ],
        total: 22500,
      },
    });
    expect(database.prepare("SELECT quantity, weight_source FROM sale_lines").all()).toEqual([
      { quantity: 2500, weight_source: "MANUAL" },
    ]);
  });

  it("answers that the line changed, writing nothing, when the screen showed another weight", async () => {
    const lineId = await sellCheese();

    expect(await changeLineWeightFor(deps(), lineId, 2500, 900)).toEqual({ kind: "stale_weight" });
    expect(database.prepare("SELECT quantity FROM sale_lines").all()).toEqual([{ quantity: 1000 }]);
  });

  it("answers the refusal of changing the quantity of a line sold by weight", async () => {
    const lineId = await sellCheese();

    expect(await changeLineQuantityFor(deps(), lineId, 1001, 1000)).toEqual({
      kind: "sold_by_weight",
    });
  });

  it("answers the refusal of retyping the weight of a line sold by the unit", async () => {
    const yerbaId = await sellTwoYerbas();

    expect(await changeLineWeightFor(deps(), yerbaId, 1000, 2)).toEqual({
      kind: "not_sold_by_weight",
    });
  });

  it.each([
    ["a line the sale does not have", "other-line", 1000, { kind: "unknown_line" }],
    ["a weight of zero", "id-2", 0, { kind: "invalid_weight" }],
  ])("answers the domain's refusal of %s", async (_case, lineId, weight, expected) => {
    await sellCheese();

    expect(await changeLineWeightFor(deps(), lineId, weight, 1000)).toEqual(expected);
  });

  it("answers that there is no sale to change", async () => {
    expect(await changeLineWeightFor(deps(), "id-2", 1000, 1000)).toEqual({ kind: "no_open_sale" });
  });

  it("answers not signed in when nobody is signed in", async () => {
    const lineId = await sellCheese();
    signedInPerson.clear();

    expect(await changeLineWeightFor(deps(), lineId, 2000, 1000)).toEqual({
      kind: "not_signed_in",
    });
  });

  it("answers not permitted to a person without the permission to sell", async () => {
    const lineId = await sellCheese();
    addPerson("u2", "guest");
    signedInPerson.set("u2");

    expect(await changeLineWeightFor(deps(), lineId, 2000, 1000)).toEqual({
      kind: "not_permitted",
    });
  });

  it("answers that no session is open", async () => {
    const lineId = await sellCheese();
    database.prepare("UPDATE cash_sessions SET state = 'CLOSED', closed_at = 'x'").run();

    expect(await changeLineWeightFor(deps(), lineId, 2000, 1000)).toEqual({
      kind: "no_open_session",
    });
  });
});

describe("weighing a line on the scale on the register", () => {
  beforeEach(priceCheese);

  async function sellCheese(): Promise<string> {
    const outcome = await addWeighedProductFor(deps(), "p2", 1000);
    if (outcome.kind !== "added") {
      throw new Error("test setup: the cheese was not added");
    }
    return outcome.sale.lines[0]?.id as string;
  }

  function weighLine(
    reading: ScaleReading,
    lineId: string,
    expected: number,
    confirmedWeightThousandths: number | null,
  ) {
    return weighLineFor(
      { ...deps(), scale: { read: async () => reading } },
      lineId,
      expected,
      confirmedWeightThousandths,
    );
  }

  it("answers the sale with the confirmed stable weight, recording the scale as its source", async () => {
    const lineId = await sellCheese();

    const outcome = await weighLine(
      { kind: "stable", weightThousandths: 2500 },
      lineId,
      1000,
      2500,
    );

    expect(outcome).toMatchObject({
      kind: "changed",
      removed_manual_discount: false,
      removed_sale_discount: false,
      sale: {
        lines: [{ id: lineId, quantity: 2500, weight_source: "SCALE", line_total: 22500 }],
        total: 22500,
      },
    });
    expect(database.prepare("SELECT quantity, weight_source FROM sale_lines").all()).toEqual([
      { quantity: 2500, weight_source: "SCALE" },
    ]);
  });

  it.each([null, 1200])(
    "answers the stable weight and its amount, changing nothing, confirming %s",
    async (confirmed) => {
      const lineId = await sellCheese();

      expect(
        await weighLine({ kind: "stable", weightThousandths: 2500 }, lineId, 1000, confirmed),
      ).toEqual({ kind: "stable", weight_thousandths: 2500, amount: 22500 });
      expect(database.prepare("SELECT quantity FROM sale_lines").all()).toEqual([
        { quantity: 1000 },
      ]);
    },
  );

  it("answers the unstable weight and its amount, changing nothing, even when it is the confirmed one", async () => {
    const lineId = await sellCheese();

    expect(
      await weighLine({ kind: "unstable", weightThousandths: 2500 }, lineId, 1000, 2500),
    ).toEqual({ kind: "unsteady", weight_thousandths: 2500, amount: 22500 });
    expect(database.prepare("SELECT quantity FROM sale_lines").all()).toEqual([{ quantity: 1000 }]);
  });

  it("answers an unstable reading that is no line weight as out of range, changing nothing", async () => {
    const lineId = await sellCheese();

    expect(
      await weighLine({ kind: "unstable", weightThousandths: -120 }, lineId, 1000, null),
    ).toEqual({ kind: "unsteady_out_of_range" });
    expect(database.prepare("SELECT quantity FROM sale_lines").all()).toEqual([{ quantity: 1000 }]);
  });

  it.each([
    ["zero", { kind: "stable", weightThousandths: 0 }, { kind: "zero_weight" }],
    ["moving", { kind: "not_stable" }, { kind: "weighing" }],
    ["unavailable", { kind: "unavailable" }, { kind: "scale_unavailable" }],
  ] as const)("answers the scale reading %s when confirming", async (_case, reading, expected) => {
    const lineId = await sellCheese();

    expect(await weighLine(reading, lineId, 1000, 1000)).toEqual(expected);
  });

  it("answers the refusal of a weight the line no longer has", async () => {
    const lineId = await sellCheese();

    expect(await weighLine({ kind: "stable", weightThousandths: 2500 }, lineId, 900, 2500)).toEqual(
      { kind: "stale_weight" },
    );
  });

  it("answers that there is no sale to change", async () => {
    expect(
      await weighLine({ kind: "stable", weightThousandths: 2500 }, "id-2", 1000, 2500),
    ).toEqual({ kind: "no_open_sale" });
  });

  it("answers not signed in when nobody is signed in", async () => {
    const lineId = await sellCheese();
    signedInPerson.clear();

    expect(
      await weighLine({ kind: "stable", weightThousandths: 2500 }, lineId, 1000, 2500),
    ).toEqual({ kind: "not_signed_in" });
  });

  it("answers not permitted to a person without the permission to sell", async () => {
    const lineId = await sellCheese();
    addPerson("u2", "guest");
    signedInPerson.set("u2");

    expect(
      await weighLine({ kind: "stable", weightThousandths: 2500 }, lineId, 1000, 2500),
    ).toEqual({ kind: "not_permitted" });
  });
});

describe("the sale in progress", () => {
  it("is none before anything was scanned", async () => {
    expect(await currentSaleFor(deps())).toBeNull();
  });

  it("is none when nobody is signed in", async () => {
    await scanProductFor(deps(), "111");
    signedInPerson.clear();

    expect(await currentSaleFor(deps())).toBeNull();
  });

  it("answers not permitted to a signed-in person without the permission to sell", async () => {
    await scanProductFor(deps(), "111");
    addPerson("u2", "guest");
    signedInPerson.set("u2");

    expect(await currentSaleFor(deps())).toBe("not_permitted");
  });

  it("answers the domain's refusal of a person who sells but did not open the session", async () => {
    await scanProductFor(deps(), "111");
    addPerson("u3", "cashier");
    signedInPerson.set("u3");

    expect(await currentSaleFor(deps())).toBe("not_permitted");
  });

  it("is the sale with its lines and the total to charge", async () => {
    await scanProductFor(deps(), "111");
    await scanProductFor(deps(), "111");

    expect(await currentSaleFor(deps())).toEqual({
      id: "id-1",
      lines: [
        {
          id: "id-2",
          product_id: "p1",
          product_name: "Yerba",
          sale_unit: "UNIT",
          weight_source: null,
          quantity: 2,
          list_unit_price: 1500,
          discount_amount: 0,
          promotion: null,
          manual_adjustment: null,
          line_total: 3000,
        },
      ],
      total: 3000,
      paid: 0,
      pending: 3000,
      payments: [],
      lines_lock: null,
      cancel_refusal: null,
      charge_refusal: null,
      mercado_pago_charge_in_progress: null,
      rebuilt_paid_order: null,
      refunds_on_cancel: [],
      refund_now_on_cancel: 0,
      cancel_authorization_required: true,
      adjust_authorization_required: true,
      sale_discount_authorization_required: true,
      gross_subtotal: 3000,
      subtotal: 3000,
      promotion_savings: 0,
      sale_discount: null,
      sale_discount_refusal: null,
    });
  });

  it("reports what was paid, what is pending and that the lines are frozen once a payment is approved", async () => {
    const saleId = await sellTwoForPayments();
    await chargeSaleInCashFor(deps(), { saleId, tendered: 1000 });

    expect(await currentSaleFor(deps())).toMatchObject({
      total: 3000,
      paid: 1000,
      pending: 2000,
      payments: [{ method: "CASH", card_type: null, amount: 1000 }],
      lines_lock: "approved_payment",
      cancel_refusal: null,
    });
  });

  it("lists the approved payments with their method and amount, in the order they were approved", async () => {
    const saleId = await sellTwoForPayments();
    const ids = idsStartingWith("payment");
    await chargeSaleByTransferFor(deps({ ids }), { saleId, amount: 1000 });
    await chargeSaleInCashFor(deps({ ids }), { saleId, tendered: 500 });

    expect(await currentSaleFor(deps())).toMatchObject({
      paid: 1500,
      payments: [
        { method: "TRANSFER", card_type: null, amount: 1000 },
        { method: "CASH", card_type: null, amount: 500 },
      ],
    });
  });

  it("lists a QR payment approved after a later cash payment after that cash payment", async () => {
    const saleId = await sellTwoForPayments();
    addQrPayment(saleId, "PENDING", NOW);
    await chargeSaleInCashFor(deps(), { saleId, tendered: 500 });
    settleApprovedMercadoPagoPayment(
      {
        ledger: new SqliteSaleLedger(database, new SqliteSignInStore(database), CHAIN_KEY),
        restoration: deps().restoration,
        clock: { now: () => NOW },
        zoneRules: fixedZoneRulesSource(),
        ids: idsStartingWith("settlement"),
      },
      { actorId: "u1", paymentTransactionId: "qr-1" },
    );

    expect(await currentSaleFor(deps())).toMatchObject({
      paid: 1500,
      payments: [
        { method: "CASH", card_type: null, amount: 500 },
        { method: "QR", card_type: null, amount: 1000 },
      ],
    });
  });

  it("lists no payment for a sale nothing was paid on", async () => {
    await sellTwoForPayments();

    expect(await currentSaleFor(deps())).toMatchObject({ paid: 0, payments: [] });
  });

  it("refuses to charge in cash once the restoration of the register is in progress", async () => {
    const saleId = await sellTwoForPayments();
    markRegisterStale();

    expect(await chargeSaleInCashFor(deps(), { saleId, tendered: 3000 })).toEqual({
      kind: "restoration_in_progress",
    });
  });

  function addQrPayment(
    saleId: string,
    state: "PENDING" | "APPROVED",
    waitEndsAt: Date,
    occurredAt: Date = NOW,
  ): void {
    database
      .prepare(
        "INSERT INTO payment_transactions (id, sale_id, kind, method, provider, amount, state, occurred_at, wait_ends_at) VALUES ('qr-1', ?, 'SALE', 'QR', 'MERCADOPAGO_QR', 1000, ?, ?, ?)",
      )
      .run(saleId, state, occurredAt.toISOString(), waitEndsAt.toISOString());
  }

  it("says that a QR charge in its wait locks the lines and refuses the cancellation", async () => {
    const saleId = await sellTwoForPayments();
    addQrPayment(
      saleId,
      "PENDING",
      new Date(NOW.getTime() + 60_000),
      new Date(NOW.getTime() - 130_000),
    );

    expect(await currentSaleFor(deps())).toMatchObject({
      lines_lock: "mercado_pago_charge_in_progress",
      cancel_refusal: "mercado_pago_charge_in_progress",
      refunds_on_cancel: [],
      mercado_pago_charge_in_progress: {
        payment_transaction_id: "qr-1",
        method: "QR",
        amount: 1000,
        remaining_seconds: 60,
        wait_seconds: 190,
      },
    });
  });

  it("says that an approved QR payment leaves a pending refund on cancelling", async () => {
    const saleId = await sellTwoForPayments();
    addQrPayment(saleId, "APPROVED", NOW);

    expect(await currentSaleFor(deps())).toMatchObject({
      lines_lock: "approved_payment",
      cancel_refusal: null,
      refunds_on_cancel: [
        { payment_id: "qr-1", method: "QR", amount: 1000, state: "PENDING", sent_by_cloud: true },
      ],
    });
  });

  it("says that an approved payment on the integrated terminal leaves a pending refund the cloud sends on cancelling", async () => {
    const saleId = await sellTwoForPayments();
    database
      .prepare(
        "INSERT INTO payment_transactions (id, sale_id, kind, method, provider, amount, state, occurred_at, wait_ends_at) VALUES ('point-1', ?, 'SALE', 'POINT', 'MERCADOPAGO_POINT', 1000, 'APPROVED', ?, ?)",
      )
      .run(saleId, NOW.toISOString(), NOW.toISOString());

    expect(await currentSaleFor(deps())).toMatchObject({
      lines_lock: "approved_payment",
      cancel_refusal: null,
      refunds_on_cancel: [
        {
          payment_id: "point-1",
          method: "POINT",
          amount: 1000,
          state: "PENDING",
          sent_by_cloud: true,
        },
      ],
    });
  });

  it("says that an approved standalone terminal payment leaves a pending refund on cancelling", async () => {
    const saleId = await sellTwoForPayments();
    await chargeSaleOnStandaloneTerminalFor(deps(), { saleId, amount: 1000 });
    const [payment] = database
      .prepare<[], { id: string }>("SELECT id FROM payment_transactions")
      .all();

    expect(await currentSaleFor(deps())).toMatchObject({
      lines_lock: "approved_payment",
      cancel_refusal: null,
      refunds_on_cancel: [
        {
          payment_id: payment?.id,
          method: "STANDALONE_TERMINAL",
          amount: 1000,
          state: "PENDING",
          sent_by_cloud: false,
        },
      ],
    });
  });

  it("lists the refund each approved payment would get if the sale were cancelled", async () => {
    const saleId = await sellTwoForPayments();
    const ids = idsStartingWith("payment");
    await chargeSaleInCashFor(deps({ ids }), { saleId, tendered: 1000 });
    await chargeSaleByTransferFor(deps({ ids }), { saleId, amount: 500 });
    const paymentIds = database
      .prepare<[], { id: string }>("SELECT id FROM payment_transactions ORDER BY rowid")
      .all()
      .map((payment) => payment.id);

    expect(await currentSaleFor(deps())).toMatchObject({
      refunds_on_cancel: [
        {
          payment_id: paymentIds[0],
          method: "CASH",
          amount: 1000,
          state: "APPROVED",
          sent_by_cloud: false,
        },
        {
          payment_id: paymentIds[1],
          method: "TRANSFER",
          amount: 500,
          state: "PENDING",
          sent_by_cloud: false,
        },
      ],
    });
  });

  it("says how much of the refunds on cancelling it is handed back at the register now", async () => {
    const saleId = await sellTwoForPayments();
    const ids = idsStartingWith("payment");
    await chargeSaleInCashFor(deps({ ids }), { saleId, tendered: 1000 });
    await chargeSaleByTransferFor(deps({ ids }), { saleId, amount: 500 });

    expect(await currentSaleFor(deps())).toMatchObject({ refund_now_on_cancel: 1000 });
  });

  it("says that nothing is handed back at the register now when no payment was made", async () => {
    await sellTwoForPayments();

    expect(await currentSaleFor(deps())).toMatchObject({ refund_now_on_cancel: 0 });
  });

  it("says that cancelling it needs another person's authorization to a person without the void sale permission", async () => {
    await scanProductFor(deps(), "111");

    expect(await currentSaleFor(deps())).toMatchObject({ cancel_authorization_required: true });
  });

  it("says that cancelling it needs nobody's authorization to a person with the void sale permission", async () => {
    database
      .prepare(
        "INSERT INTO role_permissions (role_id, permission_key, active) VALUES ('cashier', 'void_sale', 1)",
      )
      .run();
    await scanProductFor(deps(), "111");

    expect(await currentSaleFor(deps())).toMatchObject({ cancel_authorization_required: false });
  });

  it("is refused for charging when the total reaches the threshold in effect", async () => {
    saveThreshold(3000, "2026-09-30");
    await scanProductFor(deps(), "111");
    await scanProductFor(deps(), "111");

    expect(await currentSaleFor(deps())).toMatchObject({
      total: 3000,
      charge_refusal: { kind: "reaches_buyer_identification_threshold", threshold: 3000 },
    });
  });

  it("is refused for charging by the threshold that replaced a mistaken one of the same day", async () => {
    saveThreshold(1_000_000, "2026-09-30", 0);
    saveThreshold(3000, "2026-09-30", 1);
    await scanProductFor(deps(), "111");
    await scanProductFor(deps(), "111");

    expect(await currentSaleFor(deps())).toMatchObject({
      total: 3000,
      charge_refusal: { kind: "reaches_buyer_identification_threshold", threshold: 3000 },
    });
  });

  it("is not refused for charging once a threshold of the same day replaces a mistaken low one", async () => {
    saveThreshold(1000, "2026-09-30", 0);
    saveThreshold(100_000_000, "2026-09-30", 1);
    await scanProductFor(deps(), "111");
    await scanProductFor(deps(), "111");

    expect(await currentSaleFor(deps())).toMatchObject({ charge_refusal: null });
  });

  it("is refused for charging when the register holds no threshold", async () => {
    database.prepare("DELETE FROM buyer_identification_thresholds").run();
    await scanProductFor(deps(), "111");

    expect(await currentSaleFor(deps())).toMatchObject({
      charge_refusal: { kind: "no_buyer_identification_threshold" },
    });
  });
});

async function sellTwoForPayments(): Promise<string> {
  await scanProductFor(deps(), "111");
  const outcome = await scanProductFor(deps(), "111");
  if (outcome.kind !== "added") {
    throw new Error("test setup: the product was not added");
  }
  return outcome.sale.id;
}

async function sellTwoYerbas(): Promise<string> {
  await scanProductFor(deps(), "111");
  await scanProductFor(deps(), "111");
  return "id-2";
}

describe("adjusting a line of the sale in progress", () => {
  const OVERRIDE = "override_line_price_or_discount";

  function withPins(overrides: Partial<OutboxSaleRequestDeps> = {}): OutboxSaleRequestDeps {
    return deps({ gate: pinGate(), ...overrides });
  }

  function grantOverride(): void {
    database
      .prepare(
        `INSERT INTO role_permissions (role_id, permission_key, active) VALUES ('cashier', '${OVERRIDE}', 1)`,
      )
      .run();
  }

  function request(
    overrides: Partial<Parameters<typeof adjustSaleLineFor>[1]> = {},
  ): Parameters<typeof adjustSaleLineFor>[1] {
    return {
      lineId: "id-2",
      adjustment: { kind: "PERCENT", value: 10 },
      reason: "Producto golpeado",
      ...overrides,
    };
  }

  function adjustmentColumns(): unknown[] {
    return database
      .prepare(
        `SELECT manual_adjustment_kind AS kind, manual_adjustment_value AS value,
                manual_adjustment_reason AS reason, manual_adjustment_authorized_by AS authorized_by,
                discount_amount, line_total
         FROM sale_lines`,
      )
      .all();
  }

  const UNTOUCHED = [
    {
      kind: null,
      value: null,
      reason: null,
      authorized_by: null,
      discount_amount: 0,
      line_total: 3000,
    },
  ];

  it("answers the sale with the line carrying the discount to a cashier who holds the permission, recording its reason and nobody else's authorization", async () => {
    grantOverride();
    const lineId = await sellTwoYerbas();

    const outcome = await adjustSaleLineFor(withPins(), request({ lineId }));

    expect(outcome).toEqual({
      kind: "changed",
      removed_sale_discount: false,
      sale: expect.objectContaining({
        total: 2700,
        lines: [
          expect.objectContaining({
            id: lineId,
            discount_amount: 300,
            line_total: 2700,
            promotion: null,
            manual_adjustment: { kind: "PERCENT", value: 10 },
          }),
        ],
      }),
    });
    expect(adjustmentColumns()).toEqual([
      {
        kind: "PERCENT",
        value: 10,
        reason: "Producto golpeado",
        authorized_by: null,
        discount_amount: 300,
        line_total: 2700,
      },
    ]);
  });

  it.each([
    ["an overridden price", { kind: "PRICE", value: 1200 }, 2400],
    ["a discount by amount", { kind: "AMOUNT", value: 500 }, 2500],
  ] as const)("prices the line with %s", async (_case, adjustment, lineTotal) => {
    grantOverride();
    await sellTwoYerbas();

    expect(await adjustSaleLineFor(withPins(), request({ adjustment }))).toMatchObject({
      kind: "changed",
      sale: {
        total: lineTotal,
        lines: [{ line_total: lineTotal, manual_adjustment: { ...adjustment } }],
      },
    });
  });

  it("records who authorized the adjustment with their PIN, answering the sale with the adjustment alone", async () => {
    addPersonWithPin("u2", "Grace", [OVERRIDE]);
    const lineId = await sellTwoYerbas();

    const outcome = await adjustSaleLineFor(withPins(), {
      ...request({ lineId }),
      authorization: { user_id: "u2", pin: CLOSER_PIN },
    });

    expect(outcome).toEqual({
      kind: "changed",
      removed_sale_discount: false,
      sale: expect.objectContaining({
        lines: [expect.objectContaining({ manual_adjustment: { kind: "PERCENT", value: 10 } })],
      }),
    });
    expect(adjustmentColumns()).toMatchObject([{ authorized_by: "u2" }]);
  });

  it("shows the sale in progress afterwards with the adjustment alone", async () => {
    addPersonWithPin("u2", "Grace", [OVERRIDE]);
    await sellTwoYerbas();
    await adjustSaleLineFor(withPins(), {
      ...request(),
      authorization: { user_id: "u2", pin: CLOSER_PIN },
    });

    expect(await currentSaleFor(deps())).toMatchObject({
      lines: [expect.objectContaining({ manual_adjustment: { kind: "PERCENT", value: 10 } })],
    });
  });

  it("replaces the adjustment a line already has", async () => {
    grantOverride();
    await sellTwoYerbas();
    await adjustSaleLineFor(withPins(), request());

    await adjustSaleLineFor(
      withPins(),
      request({ adjustment: { kind: "PRICE", value: 1000 }, reason: "Vencimiento cercano" }),
    );

    expect(adjustmentColumns()).toEqual([
      {
        kind: "PRICE",
        value: 1000,
        reason: "Vencimiento cercano",
        authorized_by: null,
        discount_amount: 0,
        line_total: 2000,
      },
    ]);
  });

  it("refuses a cashier without the permission who brings no authorization, changing nothing", async () => {
    await sellTwoYerbas();

    expect(await adjustSaleLineFor(withPins(), request())).toEqual({ kind: "lacks_permission" });
    expect(adjustmentColumns()).toEqual(UNTOUCHED);
  });

  it("refuses a wrong PIN, changing nothing", async () => {
    addPersonWithPin("u2", "Grace", [OVERRIDE]);
    await sellTwoYerbas();

    const outcome = await adjustSaleLineFor(withPins(), {
      ...request(),
      authorization: { user_id: "u2", pin: "0000" },
    });

    expect(outcome.kind).toBe("wrong_pin");
    expect(adjustmentColumns()).toEqual(UNTOUCHED);
  });

  it("refuses the PIN of a person who lacks the permission, changing nothing", async () => {
    addPersonWithPin("u2", "Grace", ["sell_and_charge"]);
    await sellTwoYerbas();

    expect(
      await adjustSaleLineFor(withPins(), {
        ...request(),
        authorization: { user_id: "u2", pin: CLOSER_PIN },
      }),
    ).toEqual({ kind: "lacks_permission" });
    expect(adjustmentColumns()).toEqual(UNTOUCHED);
  });

  it.each([
    ["a line the sale does not have", { lineId: "other-line" }, { kind: "unknown_line" }],
    [
      "the list price as the new price",
      { adjustment: { kind: "PRICE", value: 1500 } },
      { kind: "same_as_list_price" },
    ],
    [
      "a discount above the line's gross amount",
      { adjustment: { kind: "AMOUNT", value: 3001 } },
      { kind: "discount_exceeds_line" },
    ],
  ] as const)("answers the domain's refusal of %s", async (_case, change, expected) => {
    grantOverride();
    await sellTwoYerbas();

    expect(await adjustSaleLineFor(withPins(), request(change))).toEqual(expected);
    expect(adjustmentColumns()).toEqual(UNTOUCHED);
  });

  it("answers that there is no sale to change", async () => {
    grantOverride();

    expect(await adjustSaleLineFor(withPins(), request())).toEqual({ kind: "no_open_sale" });
  });

  it("answers not signed in when nobody is signed in", async () => {
    grantOverride();
    signedInPerson.clear();

    expect(await adjustSaleLineFor(withPins(), request())).toEqual({ kind: "not_signed_in" });
  });

  it("answers not permitted to a person who sells but did not open the session", async () => {
    grantOverride();
    await sellTwoYerbas();
    database.prepare("UPDATE cash_sessions SET opened_by = 'u9'").run();

    expect(await adjustSaleLineFor(withPins(), request())).toEqual({ kind: "not_permitted" });
  });

  it("answers that no session is open", async () => {
    grantOverride();
    database.prepare("UPDATE cash_sessions SET state = 'CLOSED', closed_at = 'x'").run();

    expect(await adjustSaleLineFor(withPins(), request())).toEqual({ kind: "no_open_session" });
  });

  it("answers that the lines cannot change once a payment was approved", async () => {
    grantOverride();
    const saleId = await sellTwoForPayments();
    await chargeSaleInCashFor(deps(), { saleId, tendered: 1000 });

    expect(await adjustSaleLineFor(withPins(), request())).toEqual({ kind: "sale_has_payments" });
  });

  it("says that adjusting a line needs another person's authorization to a person without the permission", async () => {
    await scanProductFor(deps(), "111");

    expect(await currentSaleFor(deps())).toMatchObject({ adjust_authorization_required: true });
  });

  it("says that adjusting a line needs nobody's authorization to a person with the permission", async () => {
    grantOverride();
    await scanProductFor(deps(), "111");

    expect(await currentSaleFor(deps())).toMatchObject({ adjust_authorization_required: false });
  });
});

describe("telling a manual discount was removed", () => {
  async function discountedByAmount(): Promise<string> {
    database
      .prepare(
        "INSERT INTO role_permissions (role_id, permission_key, active) VALUES ('cashier', 'override_line_price_or_discount', 1)",
      )
      .run();
    const lineId = await sellTwoYerbas();
    await adjustSaleLineFor(deps(), {
      lineId,
      adjustment: { kind: "AMOUNT", value: 500 },
      reason: "Envase abierto",
    });
    return lineId;
  }

  it("answers that changing the quantity removed a discount by amount", async () => {
    const lineId = await discountedByAmount();

    expect(await changeLineQuantityFor(deps(), lineId, 1, 2)).toMatchObject({
      kind: "changed",
      removed_manual_discount: true,
      sale: { lines: [{ manual_adjustment: null, line_total: 1500 }] },
    });
  });

  it("answers that scanning another unit removed a discount by amount", async () => {
    await discountedByAmount();

    expect(await scanProductFor(deps(), "111")).toMatchObject({
      kind: "added",
      removed_manual_discount: true,
    });
  });

  it("answers that nothing was removed when the quantity of a line without a discount changes", async () => {
    const lineId = await sellTwoYerbas();

    expect(await changeLineQuantityFor(deps(), lineId, 1, 2)).toMatchObject({
      removed_manual_discount: false,
      removed_sale_discount: false,
    });
  });

  it("answers that nothing was removed when a discount by percentage stays", async () => {
    database
      .prepare(
        "INSERT INTO role_permissions (role_id, permission_key, active) VALUES ('cashier', 'override_line_price_or_discount', 1)",
      )
      .run();
    const lineId = await sellTwoYerbas();
    await adjustSaleLineFor(deps(), {
      lineId,
      adjustment: { kind: "PERCENT", value: 10 },
      reason: "Cliente frecuente",
    });

    expect(await changeLineQuantityFor(deps(), lineId, 1, 2)).toMatchObject({
      removed_manual_discount: false,
      removed_sale_discount: false,
      sale: { lines: [{ manual_adjustment: { kind: "PERCENT" } }] },
    });
  });
});

describe("changing the quantity of a line", () => {
  it("answers the sale with the new quantity and total", async () => {
    const lineId = await sellTwoYerbas();

    const outcome = await changeLineQuantityFor(deps(), lineId, 1, 2);

    expect(outcome).toMatchObject({
      kind: "changed",
      sale: { lines: [{ id: lineId, quantity: 1, line_total: 1500 }], total: 1500 },
    });
  });

  it("answers that the line changed, writing nothing, when the screen showed another quantity", async () => {
    const lineId = await sellTwoYerbas();

    expect(await changeLineQuantityFor(deps(), lineId, 1, 5)).toEqual({ kind: "stale_quantity" });
    expect(database.prepare("SELECT quantity FROM sale_lines").all()).toEqual([{ quantity: 2 }]);
  });

  it.each([
    ["a line the sale does not have", "other-line", 1, { kind: "unknown_line" }],
    ["a quantity of zero", "id-2", 0, { kind: "invalid_quantity" }],
  ])("answers the domain's refusal of %s", async (_case, lineId, quantity, expected) => {
    await sellTwoYerbas();

    expect(await changeLineQuantityFor(deps(), lineId, quantity, 2)).toEqual(expected);
  });

  it("answers that there is no sale to change", async () => {
    expect(await changeLineQuantityFor(deps(), "id-2", 1, 2)).toEqual({ kind: "no_open_sale" });
  });

  it("answers not signed in when nobody is signed in", async () => {
    const lineId = await sellTwoYerbas();
    signedInPerson.clear();

    expect(await changeLineQuantityFor(deps(), lineId, 1, 2)).toEqual({ kind: "not_signed_in" });
  });

  it("answers not permitted to a person who sells but did not open the session", async () => {
    const lineId = await sellTwoYerbas();
    addPerson("u3", "cashier");
    signedInPerson.set("u3");

    expect(await changeLineQuantityFor(deps(), lineId, 1, 2)).toEqual({ kind: "not_permitted" });
  });

  it("answers not permitted to a person without the permission to sell", async () => {
    const lineId = await sellTwoYerbas();
    addPerson("u2", "guest");
    signedInPerson.set("u2");

    expect(await changeLineQuantityFor(deps(), lineId, 1, 2)).toEqual({ kind: "not_permitted" });
  });

  it("answers that no session is open", async () => {
    const lineId = await sellTwoYerbas();
    database.prepare("UPDATE cash_sessions SET state = 'CLOSED', closed_at = 'x'").run();

    expect(await changeLineQuantityFor(deps(), lineId, 1, 2)).toEqual({ kind: "no_open_session" });
  });
});

describe("previewing an adjustment of a line", () => {
  function preview(
    lineId: string,
    adjustment: Parameters<typeof previewSaleLineAdjustmentFor>[1]["adjustment"],
  ) {
    return previewSaleLineAdjustmentFor(deps(), { lineId, adjustment });
  }

  it.each([
    ["a percentage off", { kind: "PERCENT", value: 10 }, 300, 2700, 300],
    ["an amount off", { kind: "AMOUNT", value: 500 }, 500, 2500, 500],
    ["an overridden price", { kind: "PRICE", value: 1200 }, 0, 2400, 600],
  ] as const)(
    "answers what %s would leave the line at, to a cashier without the permission to adjust",
    async (_case, adjustment, discountAmount, lineTotal, lineTotalReduction) => {
      const lineId = await sellTwoYerbas();

      expect(await preview(lineId, adjustment)).toEqual({
        kind: "preview",
        discount_amount: discountAmount,
        line_total: lineTotal,
        line_total_reduction: lineTotalReduction,
      });
    },
  );

  it("leaves the line and the events as they were", async () => {
    const lineId = await sellTwoYerbas();
    const lines = () =>
      database
        .prepare("SELECT manual_adjustment_kind, discount_amount, line_total FROM sale_lines")
        .all();
    const events = () => database.prepare("SELECT COUNT(*) AS total FROM outbox").all();
    const before = { lines: lines(), events: events() };

    await preview(lineId, { kind: "PERCENT", value: 10 });

    expect({ lines: lines(), events: events() }).toEqual(before);
  });

  it.each([
    ["a price equal to the list price", { kind: "PRICE", value: 1500 }, "same_as_list_price"],
    [
      "a discount above the line's gross amount",
      { kind: "AMOUNT", value: 3001 },
      "discount_exceeds_line",
    ],
  ] as const)("answers the domain's refusal of %s", async (_case, adjustment, kind) => {
    const lineId = await sellTwoYerbas();

    expect(await preview(lineId, adjustment)).toEqual({ kind });
  });

  it("answers the domain's refusal of a line the sale does not have", async () => {
    await sellTwoYerbas();

    expect(await preview("other-line", { kind: "PERCENT", value: 10 })).toEqual({
      kind: "unknown_line",
    });
  });

  it("answers that there is no sale to change", async () => {
    expect(await preview("id-2", { kind: "PERCENT", value: 10 })).toEqual({
      kind: "no_open_sale",
    });
  });

  it("answers not signed in when nobody is signed in", async () => {
    const lineId = await sellTwoYerbas();
    signedInPerson.clear();

    expect(await preview(lineId, { kind: "PERCENT", value: 10 })).toEqual({
      kind: "not_signed_in",
    });
  });

  it("answers not permitted to a person who sells but did not open the session", async () => {
    const lineId = await sellTwoYerbas();
    addPerson("u3", "cashier");
    signedInPerson.set("u3");

    expect(await preview(lineId, { kind: "PERCENT", value: 10 })).toEqual({
      kind: "not_permitted",
    });
  });

  it("answers that no session is open", async () => {
    const lineId = await sellTwoYerbas();
    database.prepare("UPDATE cash_sessions SET state = 'CLOSED', closed_at = 'x'").run();

    expect(await preview(lineId, { kind: "PERCENT", value: 10 })).toEqual({
      kind: "no_open_session",
    });
  });

  it("answers that the lines cannot change once a payment was approved", async () => {
    const saleId = await sellTwoForPayments();
    await chargeSaleInCashFor(deps(), { saleId, tendered: 1000 });

    expect(await preview("id-2", { kind: "PERCENT", value: 10 })).toEqual({
      kind: "sale_has_payments",
    });
  });
});

describe("discounting the sale's total", () => {
  const TOTAL_DISCOUNT = "apply_total_discount";

  function withPins(overrides: Partial<OutboxSaleRequestDeps> = {}): OutboxSaleRequestDeps {
    return deps({ gate: pinGate(), ...overrides });
  }

  function grantTotalDiscount(): void {
    database
      .prepare(
        `INSERT INTO role_permissions (role_id, permission_key, active) VALUES ('cashier', '${TOTAL_DISCOUNT}', 1)`,
      )
      .run();
  }

  function request(
    overrides: Partial<Parameters<typeof applySaleDiscountFor>[1]> = {},
  ): Parameters<typeof applySaleDiscountFor>[1] {
    return {
      discount: { kind: "PERCENT", value: 10 },
      reason: "Cliente frecuente",
      ...overrides,
    };
  }

  function discountColumns(): unknown[] {
    return database
      .prepare(
        `SELECT sale_discount_kind AS kind, sale_discount_value AS value,
                sale_discount_reason AS reason, sale_discount_authorized_by AS authorized_by
         FROM sales`,
      )
      .all();
  }

  const UNTOUCHED = [{ kind: null, value: null, reason: null, authorized_by: null }];

  it("answers the sale discounted to a cashier who holds the permission, recording its reason and nobody else's authorization", async () => {
    grantTotalDiscount();
    await sellTwoYerbas();

    const outcome = await applySaleDiscountFor(withPins(), request());

    expect(outcome).toEqual({
      kind: "applied",
      sale: expect.objectContaining({
        subtotal: 3000,
        sale_discount: { kind: "PERCENT", value: 10, amount: 300 },
        total: 2700,
        pending: 2700,
      }),
    });
    expect(discountColumns()).toEqual([
      { kind: "PERCENT", value: 10, reason: "Cliente frecuente", authorized_by: null },
    ]);
  });

  it("applies a fixed amount", async () => {
    grantTotalDiscount();
    await sellTwoYerbas();

    expect(
      await applySaleDiscountFor(withPins(), request({ discount: { kind: "AMOUNT", value: 500 } })),
    ).toMatchObject({
      kind: "applied",
      sale: { sale_discount: { kind: "AMOUNT", value: 500, amount: 500 }, total: 2500 },
    });
  });

  it("records who authorized the discount with their PIN", async () => {
    addPersonWithPin("u2", "Grace", [TOTAL_DISCOUNT]);
    await sellTwoYerbas();

    const outcome = await applySaleDiscountFor(withPins(), {
      ...request(),
      authorization: { user_id: "u2", pin: CLOSER_PIN },
    });

    expect(outcome).toMatchObject({ kind: "applied" });
    expect(discountColumns()).toMatchObject([{ authorized_by: "u2" }]);
  });

  it("shows the sale in progress afterwards with the discount", async () => {
    grantTotalDiscount();
    await sellTwoYerbas();
    await applySaleDiscountFor(withPins(), request());

    expect(await currentSaleFor(deps())).toMatchObject({
      subtotal: 3000,
      sale_discount: { kind: "PERCENT", value: 10, amount: 300 },
      total: 2700,
    });
  });

  it("shows a sale with no discount as having none, its subtotal being its total", async () => {
    await sellTwoYerbas();

    expect(await currentSaleFor(deps())).toMatchObject({
      subtotal: 3000,
      sale_discount: null,
      total: 3000,
    });
  });

  it("refuses a cashier without the permission who brings no authorization, changing nothing", async () => {
    await sellTwoYerbas();

    expect(await applySaleDiscountFor(withPins(), request())).toEqual({
      kind: "lacks_permission",
    });
    expect(discountColumns()).toEqual(UNTOUCHED);
  });

  it("refuses a wrong PIN, changing nothing", async () => {
    addPersonWithPin("u2", "Grace", [TOTAL_DISCOUNT]);
    await sellTwoYerbas();

    const outcome = await applySaleDiscountFor(withPins(), {
      ...request(),
      authorization: { user_id: "u2", pin: "0000" },
    });

    expect(outcome.kind).toBe("wrong_pin");
    expect(discountColumns()).toEqual(UNTOUCHED);
  });

  it("refuses the PIN of a person who lacks the permission, changing nothing", async () => {
    addPersonWithPin("u2", "Grace", ["override_line_price_or_discount"]);
    await sellTwoYerbas();

    expect(
      await applySaleDiscountFor(withPins(), {
        ...request(),
        authorization: { user_id: "u2", pin: CLOSER_PIN },
      }),
    ).toEqual({ kind: "lacks_permission" });
    expect(discountColumns()).toEqual(UNTOUCHED);
  });

  it("answers the domain's refusal of a discount above the sale", async () => {
    grantTotalDiscount();
    await sellTwoYerbas();

    expect(
      await applySaleDiscountFor(
        withPins(),
        request({ discount: { kind: "AMOUNT", value: 3001 } }),
      ),
    ).toEqual({ kind: "discount_exceeds_sale" });
    expect(discountColumns()).toEqual(UNTOUCHED);
  });

  it("answers that there is no sale to discount", async () => {
    grantTotalDiscount();

    expect(await applySaleDiscountFor(withPins(), request())).toEqual({ kind: "no_open_sale" });
  });

  it("answers not signed in when nobody is signed in", async () => {
    grantTotalDiscount();
    signedInPerson.clear();

    expect(await applySaleDiscountFor(withPins(), request())).toEqual({ kind: "not_signed_in" });
  });

  it("answers not permitted to a person who sells but did not open the session", async () => {
    grantTotalDiscount();
    await sellTwoYerbas();
    database.prepare("UPDATE cash_sessions SET opened_by = 'u9'").run();

    expect(await applySaleDiscountFor(withPins(), request())).toEqual({ kind: "not_permitted" });
  });

  it("answers that no session is open", async () => {
    grantTotalDiscount();
    database.prepare("UPDATE cash_sessions SET state = 'CLOSED', closed_at = 'x'").run();

    expect(await applySaleDiscountFor(withPins(), request())).toEqual({ kind: "no_open_session" });
  });

  it("answers that the lines cannot change once a payment was approved", async () => {
    grantTotalDiscount();
    const saleId = await sellTwoForPayments();
    await chargeSaleInCashFor(deps(), { saleId, tendered: 1000 });

    expect(await applySaleDiscountFor(withPins(), request())).toEqual({
      kind: "sale_has_payments",
    });
  });

  it("says that discounting the total needs another person's authorization to a person without the permission", async () => {
    await scanProductFor(deps(), "111");

    expect(await currentSaleFor(deps())).toMatchObject({
      sale_discount_authorization_required: true,
    });
  });

  it("says that discounting the total needs nobody's authorization to a person with the permission", async () => {
    grantTotalDiscount();
    await scanProductFor(deps(), "111");

    expect(await currentSaleFor(deps())).toMatchObject({
      sale_discount_authorization_required: false,
    });
  });

  it("says that the total may be discounted while the sale's lines add up to something", async () => {
    await scanProductFor(deps(), "111");

    expect(await currentSaleFor(deps())).toMatchObject({ sale_discount_refusal: null });
  });

  describe("previewing it", () => {
    function preview(discount: Parameters<typeof previewSaleDiscountFor>[1]["discount"]) {
      return previewSaleDiscountFor(deps(), { discount });
    }

    it.each([
      ["a percentage off", { kind: "PERCENT", value: 10 }, 300, 2700],
      ["an amount off", { kind: "AMOUNT", value: 500 }, 500, 2500],
    ] as const)(
      "answers what %s would leave the sale at, to a cashier without the permission",
      async (_case, discount, discountAmount, total) => {
        await sellTwoYerbas();

        expect(await preview(discount)).toEqual({
          kind: "preview",
          subtotal: 3000,
          discount_amount: discountAmount,
          total,
        });
        expect(discountColumns()).toEqual(UNTOUCHED);
      },
    );

    it("answers the domain's refusal of a discount above the sale", async () => {
      await sellTwoYerbas();

      expect(await preview({ kind: "AMOUNT", value: 3001 })).toEqual({
        kind: "discount_exceeds_sale",
      });
    });

    it("answers that there is no sale to discount", async () => {
      expect(await preview({ kind: "PERCENT", value: 10 })).toEqual({ kind: "no_open_sale" });
    });

    it("answers not signed in when nobody is signed in", async () => {
      await sellTwoYerbas();
      signedInPerson.clear();

      expect(await preview({ kind: "PERCENT", value: 10 })).toEqual({ kind: "not_signed_in" });
    });

    it("answers not permitted to a person who sells but did not open the session", async () => {
      await sellTwoYerbas();
      database.prepare("UPDATE cash_sessions SET opened_by = 'u9'").run();

      expect(await preview({ kind: "PERCENT", value: 10 })).toEqual({ kind: "not_permitted" });
    });

    it("answers that the lines cannot change once a payment was approved", async () => {
      const saleId = await sellTwoForPayments();
      await chargeSaleInCashFor(deps(), { saleId, tendered: 1000 });

      expect(await preview({ kind: "PERCENT", value: 10 })).toEqual({
        kind: "sale_has_payments",
      });
    });
  });
});

describe("charging the sale in progress in cash with a discount on its total", () => {
  const TOTAL_DISCOUNT = "apply_total_discount";

  function withPins(): OutboxSaleRequestDeps {
    return deps({ gate: pinGate() });
  }

  function grantTotalDiscount(): void {
    database
      .prepare(
        `INSERT INTO role_permissions (role_id, permission_key, active) VALUES ('cashier', '${TOTAL_DISCOUNT}', 1)`,
      )
      .run();
  }

  async function sellTwo(): Promise<string> {
    await scanProductFor(deps(), "111");
    const outcome = await scanProductFor(deps(), "111");
    if (outcome.kind !== "added") {
      throw new Error("test setup: the product was not added");
    }
    return outcome.sale.id;
  }

  function stored() {
    return {
      sales: database
        .prepare(
          `SELECT state, sale_discount_kind AS kind, sale_discount_value AS value,
                  sale_discount_reason AS reason, sale_discount_authorized_by AS authorized_by
           FROM sales`,
        )
        .all(),
      payments: database.prepare("SELECT amount, tendered FROM payment_transactions").all(),
      events: database.prepare("SELECT event_type FROM outbox").all(),
    };
  }

  const UNTOUCHED = {
    sales: [{ state: "OPEN", kind: null, value: null, reason: null, authorized_by: null }],
    payments: [],
    events: [],
  };

  it("applies the discount with its reason and completes the sale in one step", async () => {
    addFiscalConfiguration();
    grantTotalDiscount();
    const saleId = await sellTwo();

    expect(
      await chargeSaleInCashWithChangeDiscountFor(withPins(), {
        saleId,
        tendered: 5000,
        discountAmount: 500,
      }),
    ).toEqual({
      kind: "completed",
      sale_id: saleId,
      total: 2500,
      tendered: 5000,
      change: 2500,
      cash_rounding: 0,
    });
    expect(stored()).toEqual({
      sales: [
        {
          state: "COMPLETED",
          kind: "AMOUNT",
          value: 500,
          reason: "Falta de cambio",
          authorized_by: null,
        },
      ],
      payments: [{ amount: 2500, tendered: 5000 }],
      events: [{ event_type: "sale_completed" }, { event_type: "deferred_sale_recorded" }],
    });
  });

  it("keeps the discount and answers what is still pending when the amount does not cover it", async () => {
    grantTotalDiscount();
    const saleId = await sellTwo();

    expect(
      await chargeSaleInCashWithChangeDiscountFor(withPins(), {
        saleId,
        tendered: 1000,
        discountAmount: 500,
      }),
    ).toEqual({ kind: "partially_paid", sale_id: saleId, total: 2500, paid: 1000, pending: 1500 });
    expect(stored().sales).toEqual([
      { state: "OPEN", kind: "AMOUNT", value: 500, reason: "Falta de cambio", authorized_by: null },
    ]);
  });

  it("records who authorized the discount with their PIN", async () => {
    addFiscalConfiguration();
    addPersonWithPin("u2", "Grace", [TOTAL_DISCOUNT]);
    const saleId = await sellTwo();

    const outcome = await chargeSaleInCashWithChangeDiscountFor(withPins(), {
      saleId,
      tendered: 5000,
      discountAmount: 500,
      authorization: { user_id: "u2", pin: CLOSER_PIN },
    });

    expect(outcome).toMatchObject({ kind: "completed" });
    expect(stored().sales).toMatchObject([{ authorized_by: "u2" }]);
  });

  it.each([
    ["brings no authorization", undefined, { kind: "lacks_permission" }],
    ["brings a wrong PIN", { user_id: "u2", pin: "0000" }, { kind: "wrong_pin" }],
  ])(
    "refuses a cashier without the permission who %s, recording nothing",
    async (_case, authorization, refusal) => {
      addPersonWithPin("u2", "Grace", [TOTAL_DISCOUNT]);
      const saleId = await sellTwo();

      const outcome = await chargeSaleInCashWithChangeDiscountFor(withPins(), {
        saleId,
        tendered: 5000,
        discountAmount: 500,
        authorization,
      });

      expect(outcome).toMatchObject(refusal);
      expect(stored()).toEqual(UNTOUCHED);
    },
  );

  it("answers the refusal of a discount above the sale, recording nothing", async () => {
    grantTotalDiscount();
    const saleId = await sellTwo();

    expect(
      await chargeSaleInCashWithChangeDiscountFor(withPins(), {
        saleId,
        tendered: 5000,
        discountAmount: 3001,
      }),
    ).toEqual({ kind: "discount_exceeds_sale" });
    expect(stored()).toEqual(UNTOUCHED);
  });

  it("answers the refusal of the charge and leaves the discount unrecorded when the sale reaches the threshold", async () => {
    saveThreshold(2500, "2026-09-30");
    grantTotalDiscount();
    const saleId = await sellTwo();

    expect(
      await chargeSaleInCashWithChangeDiscountFor(withPins(), {
        saleId,
        tendered: 5000,
        discountAmount: 500,
      }),
    ).toEqual({ kind: "reaches_buyer_identification_threshold", threshold: 2500 });
    expect(stored()).toEqual(UNTOUCHED);
  });

  it("answers that the lines cannot change once a payment was approved", async () => {
    grantTotalDiscount();
    const saleId = await sellTwoForPayments();
    await chargeSaleInCashFor(deps(), { saleId, tendered: 1000 });

    expect(
      await chargeSaleInCashWithChangeDiscountFor(withPins(), {
        saleId,
        tendered: 1000,
        discountAmount: 100,
      }),
    ).toEqual({ kind: "sale_has_payments" });
  });

  it("answers that the register cannot record yet when the outbox key is missing", async () => {
    grantTotalDiscount();
    const saleId = await sellTwo();

    expect(
      await chargeSaleInCashWithChangeDiscountFor(
        deps({ gate: pinGate(), readOutboxChainKey: async () => undefined }),
        { saleId, tendered: 5000, discountAmount: 500 },
      ),
    ).toEqual({ kind: "unavailable" });
    expect(stored()).toEqual(UNTOUCHED);
  });

  it("answers not signed in when nobody is signed in", async () => {
    grantTotalDiscount();
    const saleId = await sellTwo();
    signedInPerson.clear();

    expect(
      await chargeSaleInCashWithChangeDiscountFor(withPins(), {
        saleId,
        tendered: 5000,
        discountAmount: 500,
      }),
    ).toEqual({ kind: "not_signed_in" });
  });
});

describe("telling the discount on the sale's total was removed", () => {
  async function discountedTotal(): Promise<string> {
    database
      .prepare(
        "INSERT INTO role_permissions (role_id, permission_key, active) VALUES ('cashier', 'apply_total_discount', 1)",
      )
      .run();
    const lineId = await sellTwoYerbas();
    await applySaleDiscountFor(deps(), {
      discount: { kind: "AMOUNT", value: 500 },
      reason: "Cliente frecuente",
    });
    return lineId;
  }

  async function discountedTwoLineTotal(): Promise<string> {
    addSugar();
    database
      .prepare(
        "INSERT INTO role_permissions (role_id, permission_key, active) VALUES ('cashier', 'apply_total_discount', 1)",
      )
      .run();
    const first = await scanProductFor(deps(), "111");
    await scanProductFor(deps(), "333");
    await applySaleDiscountFor(deps(), {
      discount: { kind: "AMOUNT", value: 500 },
      reason: "Cliente frecuente",
    });
    if (first.kind !== "added") {
      throw new Error("test setup: the product was not added");
    }
    return first.sale.lines[0]?.id ?? "";
  }

  it("answers that scanning another unit removed it, leaving the sale undiscounted", async () => {
    await discountedTotal();

    expect(await scanProductFor(deps(), "111")).toMatchObject({
      kind: "added",
      removed_sale_discount: true,
      sale: { sale_discount: null, subtotal: 4500, total: 4500 },
    });
  });

  it("answers that changing a quantity removed it", async () => {
    const lineId = await discountedTotal();

    expect(await changeLineQuantityFor(deps(), lineId, 1, 2)).toMatchObject({
      kind: "changed",
      removed_sale_discount: true,
      sale: { sale_discount: null, total: 1500 },
    });
  });

  it("answers that removing a line removed it", async () => {
    const lineId = await discountedTwoLineTotal();

    expect(await removeSaleLineFor(deps(), lineId)).toMatchObject({
      kind: "removed",
      removed_sale_discount: true,
      sale: { sale_discount: null },
    });
  });

  it("answers that adjusting a line removed it", async () => {
    const lineId = await discountedTotal();
    database
      .prepare(
        "INSERT INTO role_permissions (role_id, permission_key, active) VALUES ('cashier', 'override_line_price_or_discount', 1)",
      )
      .run();

    expect(
      await adjustSaleLineFor(deps(), {
        lineId,
        adjustment: { kind: "PERCENT", value: 10 },
        reason: "Producto golpeado",
      }),
    ).toMatchObject({
      kind: "changed",
      removed_sale_discount: true,
      sale: { sale_discount: null, total: 2700 },
    });
  });

  it("answers that nothing was removed when the sale had no discount on its total", async () => {
    const lineId = await sellTwoYerbas();

    expect(await changeLineQuantityFor(deps(), lineId, 1, 2)).toMatchObject({
      removed_sale_discount: false,
    });
  });
});

describe("removing a line", () => {
  async function sellTwoProducts(): Promise<string> {
    addSugar();
    const first = await scanProductFor(deps(), "111");
    await scanProductFor(deps(), "333");
    if (first.kind !== "added") {
      throw new Error("test setup: the product was not added");
    }
    return first.sale.lines[0]?.id ?? "";
  }

  it("answers the sale without the line", async () => {
    const lineId = await sellTwoProducts();

    const outcome = await removeSaleLineFor(deps(), lineId);

    expect(outcome).toMatchObject({
      kind: "removed",
      removed_sale_discount: false,
      sale: { lines: [expect.objectContaining({ product_id: "p3" })] },
    });
    expect(database.prepare("SELECT id FROM sale_lines").all()).toHaveLength(1);
  });

  it("appends nothing to the outbox", async () => {
    const lineId = await sellTwoProducts();

    await removeSaleLineFor(deps(), lineId);

    expect(database.prepare("SELECT event_type FROM outbox").all()).toEqual([]);
  });

  it("answers that no sale remains when the last line goes, leaving nothing behind", async () => {
    const lineId = await sellTwoYerbas();

    expect(await removeSaleLineFor(deps(), lineId)).toEqual({
      kind: "removed",
      removed_sale_discount: false,
      sale: null,
    });

    expect(database.prepare("SELECT id FROM sales").all()).toEqual([]);
    expect(database.prepare("SELECT id FROM sale_lines").all()).toEqual([]);
    expect(database.prepare("SELECT event_type FROM outbox").all()).toEqual([]);
    expect(await currentSaleFor(deps())).toBeNull();
  });

  it("answers the domain's refusal of a line the sale does not have", async () => {
    await sellTwoYerbas();

    expect(await removeSaleLineFor(deps(), "other-line")).toEqual({ kind: "unknown_line" });
  });

  it("answers that there is no sale to change", async () => {
    expect(await removeSaleLineFor(deps(), "id-2")).toEqual({ kind: "no_open_sale" });
  });

  it("answers not signed in when nobody is signed in", async () => {
    const lineId = await sellTwoYerbas();
    signedInPerson.clear();

    expect(await removeSaleLineFor(deps(), lineId)).toEqual({ kind: "not_signed_in" });
  });

  it("answers not permitted to a person who sells but did not open the session", async () => {
    const lineId = await sellTwoYerbas();
    addPerson("u3", "cashier");
    signedInPerson.set("u3");

    expect(await removeSaleLineFor(deps(), lineId)).toEqual({ kind: "not_permitted" });
  });

  it("answers that no session is open", async () => {
    const lineId = await sellTwoYerbas();
    database.prepare("UPDATE cash_sessions SET state = 'CLOSED', closed_at = 'x'").run();

    expect(await removeSaleLineFor(deps(), lineId)).toEqual({ kind: "no_open_session" });
  });
});

describe("cancelling the sale", () => {
  it("empties the cart, leaving no sale and nothing in the outbox", async () => {
    await sellTwoYerbas();

    expect(await cancelSaleFor(deps())).toEqual({ kind: "cancelled" });

    expect(database.prepare("SELECT id FROM sales").all()).toEqual([]);
    expect(database.prepare("SELECT id FROM sale_lines").all()).toEqual([]);
    expect(database.prepare("SELECT event_type FROM outbox").all()).toEqual([]);
  });

  it("keeps the sale, cancelled, with its Mercado Pago charges that ended unpaid", async () => {
    await sellTwoYerbas();
    const { id: saleId } = database.prepare<[], { id: string }>("SELECT id FROM sales").get() ?? {
      id: "",
    };
    const endCharge = database.prepare(
      "INSERT INTO payment_transactions (id, sale_id, kind, method, provider, amount, state, occurred_at, wait_ends_at, card_type) VALUES (?, ?, 'SALE', 'POINT', 'MERCADOPAGO_POINT', 3000, ?, ?, ?, 'CREDIT')",
    );
    endCharge.run("point-1", saleId, "CANCELLED", NOW.toISOString(), NOW.toISOString());
    endCharge.run("point-2", saleId, "DECLINED", NOW.toISOString(), NOW.toISOString());

    expect(await cancelSaleFor(deps())).toEqual({ kind: "cancelled" });

    expect(database.prepare("SELECT id, state FROM sales").all()).toEqual([
      { id: saleId, state: "CANCELLED" },
    ]);
    expect(
      database.prepare("SELECT id, sale_id, state FROM payment_transactions ORDER BY id").all(),
    ).toEqual([
      { id: "point-1", sale_id: saleId, state: "CANCELLED" },
      { id: "point-2", sale_id: saleId, state: "DECLINED" },
    ]);
  });

  it("lets the next scan start a new sale", async () => {
    const shared = deps();
    await scanProductFor(shared, "111");
    await cancelSaleFor(shared);

    expect(await scanProductFor(shared, "111")).toMatchObject({
      kind: "added",
      removed_manual_discount: false,
      removed_sale_discount: false,
      sale: { lines: [{ quantity: 1 }], total: 1500 },
    });
    expect(await currentSaleFor(shared)).toMatchObject({ total: 1500 });
  });

  it("answers that there is no sale to cancel", async () => {
    expect(await cancelSaleFor(deps())).toEqual({ kind: "no_open_sale" });
  });

  it("answers not signed in when nobody is signed in", async () => {
    await sellTwoYerbas();
    signedInPerson.clear();

    expect(await cancelSaleFor(deps())).toEqual({ kind: "not_signed_in" });
    expect(database.prepare("SELECT state FROM sales").all()).toEqual([{ state: "OPEN" }]);
  });

  it("answers not permitted to a person who sells but did not open the session", async () => {
    await sellTwoYerbas();
    addPerson("u3", "cashier");
    signedInPerson.set("u3");

    expect(await cancelSaleFor(deps())).toEqual({ kind: "not_permitted" });
    expect(database.prepare("SELECT state FROM sales").all()).toEqual([{ state: "OPEN" }]);
  });

  it("answers that no session is open", async () => {
    await sellTwoYerbas();
    database.prepare("UPDATE cash_sessions SET state = 'CLOSED', closed_at = 'x'").run();

    expect(await cancelSaleFor(deps())).toEqual({ kind: "no_open_session" });
  });
});

describe("a cart that ends", () => {
  function endUnpaidMercadoPagoCharges(): void {
    const { id: saleId } = database.prepare<[], { id: string }>("SELECT id FROM sales").get() ?? {
      id: "",
    };
    database
      .prepare(
        "INSERT INTO payment_transactions (id, sale_id, kind, method, provider, amount, state, occurred_at, wait_ends_at, card_type) VALUES ('point-1', ?, 'SALE', 'POINT', 'MERCADOPAGO_POINT', 3000, 'CANCELLED', ?, ?, 'CREDIT')",
      )
      .run(saleId, NOW.toISOString(), NOW.toISOString());
  }

  function expectNoSaleInProgress(): void {
    expect(anySaleIsOpen(database)).toBe(false);
    expect(sessionOpenSaleFor(database, NOW)).toBeNull();
  }

  it("lets the cash session close once every line was removed", async () => {
    const lineId = await sellTwoYerbas();
    await removeSaleLineFor(deps(), lineId);

    expectNoSaleInProgress();
    expect(await closeCashSessionFor(deps(), { sessionId: "session-1", countedCash: 0 })).toEqual(
      expect.objectContaining({ kind: "closed" }),
    );
  });

  it("keeps the cart's lines after the register restarts", async () => {
    addSugar();
    await sellTwoYerbas();
    await scanProductFor(deps(), "333");
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-restart-"));
    try {
      const path = join(folder, "register.sqlite");
      writeFileSync(path, database.serialize());
      const reopened = openLocalDatabase(path, LOCAL_MIGRATIONS, migrationClock);
      try {
        expect(await currentSaleFor(deps({ database: reopened }))).toMatchObject({
          lines: [
            expect.objectContaining({ product_id: "p1", quantity: 2 }),
            expect.objectContaining({ product_id: "p3" }),
          ],
        });
      } finally {
        reopened.close();
      }
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it.each([
    ["emptying the cart", (lineId: string) => cancelSaleFor(deps()).then(() => lineId)],
    [
      "removing its last line",
      (lineId: string) => removeSaleLineFor(deps(), lineId).then(() => lineId),
    ],
  ])(
    "after %s with a charge that ended unpaid keeps a closed local row that sends nothing and is no sale in progress",
    async (_name, end) => {
      const lineId = await sellTwoYerbas();
      endUnpaidMercadoPagoCharges();

      await end(lineId);

      expect(database.prepare("SELECT state FROM sales").all()).toEqual([{ state: "CANCELLED" }]);
      expect(database.prepare("SELECT event_type FROM outbox").all()).toEqual([]);
      expect(await currentSaleFor(deps())).toBeNull();
      expectNoSaleInProgress();
      expect(await closeCashSessionFor(deps(), { sessionId: "session-1", countedCash: 0 })).toEqual(
        expect.objectContaining({ kind: "closed" }),
      );
    },
  );
});

describe("charging the sale in progress in cash", () => {
  async function sellTwo(): Promise<string> {
    await scanProductFor(deps(), "111");
    const outcome = await scanProductFor(deps(), "111");
    if (outcome.kind !== "added") {
      throw new Error("test setup: the product was not added");
    }
    return outcome.sale.id;
  }

  it("completes the sale and answers what was charged and the change", async () => {
    addFiscalConfiguration();
    const saleId = await sellTwo();

    expect(await chargeSaleInCashFor(deps(), { saleId, tendered: 5000 })).toEqual({
      kind: "completed",
      sale_id: saleId,
      total: 3000,
      tendered: 5000,
      change: 2000,
      cash_rounding: 0,
    });
    expect(database.prepare("SELECT state FROM sales").all()).toEqual([{ state: "COMPLETED" }]);
    expect(database.prepare("SELECT event_type FROM outbox").all()).toEqual([
      { event_type: "sale_completed" },
      { event_type: "deferred_sale_recorded" },
    ]);
  });

  it("answers the sale as refused when what it adds reaches the threshold", async () => {
    saveThreshold(3000, "2026-09-30");
    await scanProductFor(deps(), "111");

    expect(await scanProductFor(deps(), "111")).toMatchObject({
      kind: "added",
      removed_manual_discount: false,
      removed_sale_discount: false,
      sale: {
        charge_refusal: { kind: "reaches_buyer_identification_threshold", threshold: 3000 },
      },
    });
  });

  it("refuses to charge a sale that reaches the threshold, leaving it open", async () => {
    saveThreshold(3000, "2026-09-30");
    const saleId = await sellTwo();

    expect(await chargeSaleInCashFor(deps(), { saleId, tendered: 5000 })).toEqual({
      kind: "reaches_buyer_identification_threshold",
      threshold: 3000,
    });
    expect(database.prepare("SELECT state FROM sales").all()).toEqual([{ state: "OPEN" }]);
  });

  it("refuses to charge any sale while the register holds no threshold", async () => {
    database.prepare("DELETE FROM buyer_identification_thresholds").run();
    const saleId = await sellTwo();

    expect(await chargeSaleInCashFor(deps(), { saleId, tendered: 5000 })).toEqual({
      kind: "no_buyer_identification_threshold",
    });
    expect(database.prepare("SELECT state FROM sales").all()).toEqual([{ state: "OPEN" }]);
  });

  it("composes the factura C of the completed sale from the register's fiscal configuration", async () => {
    addFiscalConfiguration();
    const saleId = await sellTwo();

    await chargeSaleInCashFor(deps(), { saleId, tendered: 5000 });

    expect(
      database.prepare("SELECT sale_id, outcome, document FROM pre_emission_gate_outcomes").all(),
    ).toEqual([
      {
        sale_id: saleId,
        outcome: "PASSED",
        document: expect.stringContaining('"netAmount":3000,"vatAmount":0'),
      },
    ]);
    expect(database.prepare("SELECT event_type FROM outbox").all()).toEqual([
      { event_type: "sale_completed" },
      { event_type: "deferred_sale_recorded" },
    ]);
  });

  it("completes the sale and answers as usual when the pre-emission gate fails, queuing the failure", async () => {
    const saleId = await sellTwo();

    expect(await chargeSaleInCashFor(deps(), { saleId, tendered: 5000 })).toEqual({
      kind: "completed",
      sale_id: saleId,
      total: 3000,
      tendered: 5000,
      change: 2000,
      cash_rounding: 0,
    });
    expect(
      database.prepare("SELECT outcome, failure_reason FROM pre_emission_gate_outcomes").all(),
    ).toEqual([{ outcome: "FAILED", failure_reason: "issuer_identification_missing" }]);
    expect(database.prepare("SELECT event_type FROM outbox ORDER BY device_seq").all()).toEqual([
      { event_type: "sale_completed" },
      { event_type: "deferred_sale_recorded" },
      { event_type: "fiscal_gate_failed" },
    ]);
  });

  it("completes nothing when the pre-emission gate of the sale cannot be recorded", async () => {
    const saleId = await sellTwo();
    database.exec("DROP TABLE pre_emission_gate_outcomes");

    await expect(chargeSaleInCashFor(deps(), { saleId, tendered: 5000 })).rejects.toThrow();

    expect(database.prepare("SELECT state FROM sales").all()).toEqual([{ state: "OPEN" }]);
    expect(database.prepare("SELECT event_type FROM outbox").all()).toEqual([]);
  });

  it("answers what is paid and what is pending when the cash does not cover the sale, leaving it open", async () => {
    const saleId = await sellTwo();

    expect(await chargeSaleInCashFor(deps(), { saleId, tendered: 1000 })).toEqual({
      kind: "partially_paid",
      sale_id: saleId,
      total: 3000,
      paid: 1000,
      pending: 2000,
    });
    expect(database.prepare("SELECT state FROM sales").all()).toEqual([{ state: "OPEN" }]);
    expect(database.prepare("SELECT event_type FROM outbox").all()).toEqual([]);
  });

  it.each([
    ["an amount that is not a valid cash amount", "invalid_amount", 0],
    ["a sale that is not the one in progress", "no_open_sale", 3000],
  ] as const)("answers the domain's refusal of %s", async (_case, kind, tendered) => {
    const saleId = await sellTwo();

    expect(
      await chargeSaleInCashFor(deps(), {
        saleId: kind === "no_open_sale" ? "other-sale" : saleId,
        tendered,
      }),
    ).toEqual({ kind });
  });

  it("answers the domain's refusal of a sale whose total is zero", async () => {
    const saleId = await sellTwo();
    database.prepare("UPDATE sale_lines SET line_total = 0").run();

    expect(await chargeSaleInCashFor(deps(), { saleId, tendered: 3000 })).toEqual({
      kind: "zero_total",
    });
  });

  it("answers that no session is open", async () => {
    const saleId = await sellTwo();
    database.prepare("UPDATE cash_sessions SET state = 'CLOSED', closed_at = 'x'").run();

    expect(await chargeSaleInCashFor(deps(), { saleId, tendered: 3000 })).toEqual({
      kind: "no_open_session",
    });
  });

  it("answers not signed in when nobody is signed in", async () => {
    const saleId = await sellTwo();
    signedInPerson.clear();

    expect(await chargeSaleInCashFor(deps(), { saleId, tendered: 3000 })).toEqual({
      kind: "not_signed_in",
    });
  });

  it("answers not permitted to a signed-in person without the permission to sell", async () => {
    const saleId = await sellTwo();
    addPerson("u2", "guest");
    signedInPerson.set("u2");

    expect(await chargeSaleInCashFor(deps(), { saleId, tendered: 3000 })).toEqual({
      kind: "not_permitted",
    });
    expect(database.prepare("SELECT state FROM sales").all()).toEqual([{ state: "OPEN" }]);
  });

  it("answers unavailable, charging nothing, when the register holds no outbox chain key", async () => {
    const saleId = await sellTwo();

    expect(
      await chargeSaleInCashFor(deps({ readOutboxChainKey: async () => undefined }), {
        saleId,
        tendered: 3000,
      }),
    ).toEqual({ kind: "unavailable" });
    expect(database.prepare("SELECT state FROM sales").all()).toEqual([{ state: "OPEN" }]);
  });
});

describe("charging the sale in progress by transfer", () => {
  async function sellTwo(): Promise<string> {
    await scanProductFor(deps(), "111");
    const outcome = await scanProductFor(deps(), "111");
    if (outcome.kind !== "added") {
      throw new Error("test setup: the product was not added");
    }
    return outcome.sale.id;
  }

  it("completes the sale and answers what was charged", async () => {
    addFiscalConfiguration();
    const saleId = await sellTwo();

    expect(await chargeSaleByTransferFor(deps(), { saleId, amount: 3000 })).toEqual({
      kind: "completed",
      sale_id: saleId,
      total: 3000,
    });
    expect(database.prepare("SELECT state FROM sales").all()).toEqual([{ state: "COMPLETED" }]);
    expect(database.prepare("SELECT event_type FROM outbox").all()).toEqual([
      { event_type: "sale_completed" },
      { event_type: "deferred_sale_recorded" },
    ]);
  });

  it("records one approved transfer for the amount, confirmed by the signed-in person", async () => {
    const saleId = await sellTwo();

    await chargeSaleByTransferFor(deps(), { saleId, amount: 3000 });

    expect(
      database
        .prepare(
          "SELECT sale_id, method, amount, tendered, authorized_by, confirmed_at, state FROM payment_transactions",
        )
        .all(),
    ).toEqual([
      {
        sale_id: saleId,
        method: "TRANSFER",
        amount: 3000,
        tendered: null,
        authorized_by: "u1",
        confirmed_at: NOW.toISOString(),
        state: "APPROVED",
      },
    ]);
  });

  it("composes the factura C of the completed sale like a cash charge does", async () => {
    addFiscalConfiguration();
    const saleId = await sellTwo();

    await chargeSaleByTransferFor(deps(), { saleId, amount: 3000 });

    expect(
      database.prepare("SELECT sale_id, outcome FROM pre_emission_gate_outcomes").all(),
    ).toEqual([{ sale_id: saleId, outcome: "PASSED" }]);
  });

  it("completes nothing when the pre-emission gate of the sale cannot be recorded", async () => {
    const saleId = await sellTwo();
    database.exec("DROP TABLE pre_emission_gate_outcomes");

    await expect(chargeSaleByTransferFor(deps(), { saleId, amount: 3000 })).rejects.toThrow();

    expect(database.prepare("SELECT state FROM sales").all()).toEqual([{ state: "OPEN" }]);
    expect(database.prepare("SELECT count(*) AS total FROM payment_transactions").get()).toEqual({
      total: 0,
    });
  });

  it("answers what is paid and what is pending when the transfer does not cover the sale, leaving it open", async () => {
    const saleId = await sellTwo();

    expect(await chargeSaleByTransferFor(deps(), { saleId, amount: 1200 })).toEqual({
      kind: "partially_paid",
      sale_id: saleId,
      total: 3000,
      paid: 1200,
      pending: 1800,
    });
    expect(database.prepare("SELECT state FROM sales").all()).toEqual([{ state: "OPEN" }]);
    expect(database.prepare("SELECT method, amount FROM payment_transactions").all()).toEqual([
      { method: "TRANSFER", amount: 1200 },
    ]);
  });

  it("answers how much is pending when the transfer exceeds it, charging nothing", async () => {
    const saleId = await sellTwo();

    expect(await chargeSaleByTransferFor(deps(), { saleId, amount: 3001 })).toEqual({
      kind: "exceeds_pending",
      pending: 3000,
    });
    expect(database.prepare("SELECT count(*) AS total FROM payment_transactions").get()).toEqual({
      total: 0,
    });
  });

  it("answers the domain's refusal of an amount that is not positive", async () => {
    const saleId = await sellTwo();

    expect(await chargeSaleByTransferFor(deps(), { saleId, amount: 0 })).toEqual({
      kind: "invalid_amount",
    });
  });

  it("answers the domain's refusal of a sale that is not the one in progress", async () => {
    await sellTwo();

    expect(await chargeSaleByTransferFor(deps(), { saleId: "other-sale", amount: 3000 })).toEqual({
      kind: "no_open_sale",
    });
  });

  it("refuses to charge by transfer a sale that reaches the threshold, leaving it open", async () => {
    saveThreshold(3000, "2026-09-30");
    const saleId = await sellTwo();

    expect(await chargeSaleByTransferFor(deps(), { saleId, amount: 3000 })).toEqual({
      kind: "reaches_buyer_identification_threshold",
      threshold: 3000,
    });
    expect(database.prepare("SELECT state FROM sales").all()).toEqual([{ state: "OPEN" }]);
    expect(database.prepare("SELECT count(*) AS total FROM payment_transactions").get()).toEqual({
      total: 0,
    });
  });

  it("refuses to charge by transfer any sale while the register holds no threshold", async () => {
    database.prepare("DELETE FROM buyer_identification_thresholds").run();
    const saleId = await sellTwo();

    expect(await chargeSaleByTransferFor(deps(), { saleId, amount: 3000 })).toEqual({
      kind: "no_buyer_identification_threshold",
    });
    expect(database.prepare("SELECT state FROM sales").all()).toEqual([{ state: "OPEN" }]);
  });

  it("answers the domain's refusal of a sale whose total is zero", async () => {
    const saleId = await sellTwo();
    database.prepare("UPDATE sale_lines SET line_total = 0").run();

    expect(await chargeSaleByTransferFor(deps(), { saleId, amount: 3000 })).toEqual({
      kind: "zero_total",
    });
  });

  it("answers the domain's refusal of a sale without lines", async () => {
    const saleId = await sellTwo();
    database.exec("DELETE FROM sale_line_promotions; DELETE FROM sale_lines");

    expect(await chargeSaleByTransferFor(deps(), { saleId, amount: 3000 })).toEqual({
      kind: "empty_sale",
    });
  });

  it("answers that no session is open", async () => {
    const saleId = await sellTwo();
    database.prepare("UPDATE cash_sessions SET state = 'CLOSED', closed_at = 'x'").run();

    expect(await chargeSaleByTransferFor(deps(), { saleId, amount: 3000 })).toEqual({
      kind: "no_open_session",
    });
  });

  it("answers not signed in when nobody is signed in", async () => {
    const saleId = await sellTwo();
    signedInPerson.clear();

    expect(await chargeSaleByTransferFor(deps(), { saleId, amount: 3000 })).toEqual({
      kind: "not_signed_in",
    });
  });

  it("answers not permitted to a signed-in person without the permission to sell", async () => {
    const saleId = await sellTwo();
    addPerson("u2", "guest");
    signedInPerson.set("u2");

    expect(await chargeSaleByTransferFor(deps(), { saleId, amount: 3000 })).toEqual({
      kind: "not_permitted",
    });
    expect(database.prepare("SELECT state FROM sales").all()).toEqual([{ state: "OPEN" }]);
    expect(database.prepare("SELECT count(*) AS total FROM payment_transactions").get()).toEqual({
      total: 0,
    });
  });

  it("answers unavailable, charging nothing, when the register holds no outbox chain key", async () => {
    const saleId = await sellTwo();

    expect(
      await chargeSaleByTransferFor(deps({ readOutboxChainKey: async () => undefined }), {
        saleId,
        amount: 3000,
      }),
    ).toEqual({ kind: "unavailable" });
    expect(database.prepare("SELECT state FROM sales").all()).toEqual([{ state: "OPEN" }]);
  });
});

describe("charging the sale in progress on the standalone terminal", () => {
  async function sellTwo(): Promise<string> {
    await scanProductFor(deps(), "111");
    const outcome = await scanProductFor(deps(), "111");
    if (outcome.kind !== "added") {
      throw new Error("test setup: the product was not added");
    }
    return outcome.sale.id;
  }

  it("completes the sale and answers what was charged", async () => {
    addFiscalConfiguration();
    const saleId = await sellTwo();

    expect(await chargeSaleOnStandaloneTerminalFor(deps(), { saleId, amount: 3000 })).toEqual({
      kind: "completed",
      sale_id: saleId,
      total: 3000,
    });
    expect(database.prepare("SELECT state FROM sales").all()).toEqual([{ state: "COMPLETED" }]);
    expect(database.prepare("SELECT event_type FROM outbox").all()).toEqual([
      { event_type: "sale_completed" },
      { event_type: "deferred_sale_recorded" },
    ]);
  });

  it("records one approved standalone terminal payment for the amount, confirmed by the signed-in person", async () => {
    const saleId = await sellTwo();

    await chargeSaleOnStandaloneTerminalFor(deps(), { saleId, amount: 3000 });

    expect(
      database
        .prepare(
          "SELECT sale_id, method, amount, tendered, authorized_by, confirmed_at, state FROM payment_transactions",
        )
        .all(),
    ).toEqual([
      {
        sale_id: saleId,
        method: "STANDALONE_TERMINAL",
        amount: 3000,
        tendered: null,
        authorized_by: "u1",
        confirmed_at: NOW.toISOString(),
        state: "APPROVED",
      },
    ]);
  });

  it("records the payment on the standalone terminal provider", async () => {
    const saleId = await sellTwo();

    await chargeSaleOnStandaloneTerminalFor(deps(), { saleId, amount: 3000 });

    expect(database.prepare("SELECT method, provider FROM payment_transactions").all()).toEqual([
      { method: "STANDALONE_TERMINAL", provider: "EXTERNAL_TERMINAL" },
    ]);
  });

  it("completes the sale without reaching the cloud", async () => {
    const reachCloud = vi.fn(async () => {
      throw new Error("the cloud is unreachable");
    });
    vi.stubGlobal("fetch", reachCloud);
    const saleId = await sellTwo();

    expect(await chargeSaleOnStandaloneTerminalFor(deps(), { saleId, amount: 3000 })).toEqual({
      kind: "completed",
      sale_id: saleId,
      total: 3000,
    });
    expect(reachCloud).not.toHaveBeenCalled();
    expect(database.prepare("SELECT state FROM sales").all()).toEqual([{ state: "COMPLETED" }]);
    vi.unstubAllGlobals();
  });

  it("refuses to charge, writing nothing, while a Mercado Pago charge of the sale is in its wait", async () => {
    const saleId = await sellTwo();
    database
      .prepare(
        "INSERT INTO payment_transactions (id, sale_id, kind, method, provider, amount, state, occurred_at, wait_ends_at) VALUES ('qr-1', ?, 'SALE', 'QR', 'MERCADOPAGO_QR', 1000, 'PENDING', ?, ?)",
      )
      .run(saleId, NOW.toISOString(), new Date(NOW.getTime() + 60_000).toISOString());

    expect(await chargeSaleOnStandaloneTerminalFor(deps(), { saleId, amount: 3000 })).toEqual({
      kind: "mercado_pago_charge_in_progress",
    });
    expect(database.prepare("SELECT state FROM sales").all()).toEqual([{ state: "OPEN" }]);
    expect(database.prepare("SELECT id FROM payment_transactions").all()).toEqual([{ id: "qr-1" }]);
  });

  it("composes the factura C of the completed sale like a cash charge does", async () => {
    addFiscalConfiguration();
    const saleId = await sellTwo();

    await chargeSaleOnStandaloneTerminalFor(deps(), { saleId, amount: 3000 });

    expect(
      database.prepare("SELECT sale_id, outcome FROM pre_emission_gate_outcomes").all(),
    ).toEqual([{ sale_id: saleId, outcome: "PASSED" }]);
  });

  it("completes nothing when the pre-emission gate of the sale cannot be recorded", async () => {
    const saleId = await sellTwo();
    database.exec("DROP TABLE pre_emission_gate_outcomes");

    await expect(
      chargeSaleOnStandaloneTerminalFor(deps(), { saleId, amount: 3000 }),
    ).rejects.toThrow();

    expect(database.prepare("SELECT state FROM sales").all()).toEqual([{ state: "OPEN" }]);
    expect(database.prepare("SELECT count(*) AS total FROM payment_transactions").get()).toEqual({
      total: 0,
    });
  });

  it("answers what is paid and what is pending when the payment does not cover the sale, leaving it open", async () => {
    const saleId = await sellTwo();

    expect(await chargeSaleOnStandaloneTerminalFor(deps(), { saleId, amount: 1200 })).toEqual({
      kind: "partially_paid",
      sale_id: saleId,
      total: 3000,
      paid: 1200,
      pending: 1800,
    });
    expect(database.prepare("SELECT state FROM sales").all()).toEqual([{ state: "OPEN" }]);
    expect(database.prepare("SELECT method, amount FROM payment_transactions").all()).toEqual([
      { method: "STANDALONE_TERMINAL", amount: 1200 },
    ]);
  });

  it("answers how much is pending when the payment exceeds it, charging nothing", async () => {
    const saleId = await sellTwo();

    expect(await chargeSaleOnStandaloneTerminalFor(deps(), { saleId, amount: 3001 })).toEqual({
      kind: "exceeds_pending",
      pending: 3000,
    });
    expect(database.prepare("SELECT count(*) AS total FROM payment_transactions").get()).toEqual({
      total: 0,
    });
  });

  it("answers the domain's refusal of an amount that is not positive", async () => {
    const saleId = await sellTwo();

    expect(await chargeSaleOnStandaloneTerminalFor(deps(), { saleId, amount: 0 })).toEqual({
      kind: "invalid_amount",
    });
  });

  it("answers the domain's refusal of a sale that is not the one in progress", async () => {
    await sellTwo();

    expect(
      await chargeSaleOnStandaloneTerminalFor(deps(), { saleId: "other-sale", amount: 3000 }),
    ).toEqual({
      kind: "no_open_sale",
    });
  });

  it("refuses to charge on the standalone terminal a sale that reaches the threshold, leaving it open", async () => {
    saveThreshold(3000, "2026-09-30");
    const saleId = await sellTwo();

    expect(await chargeSaleOnStandaloneTerminalFor(deps(), { saleId, amount: 3000 })).toEqual({
      kind: "reaches_buyer_identification_threshold",
      threshold: 3000,
    });
    expect(database.prepare("SELECT state FROM sales").all()).toEqual([{ state: "OPEN" }]);
    expect(database.prepare("SELECT count(*) AS total FROM payment_transactions").get()).toEqual({
      total: 0,
    });
  });

  it("refuses to charge on the standalone terminal any sale while the register holds no threshold", async () => {
    database.prepare("DELETE FROM buyer_identification_thresholds").run();
    const saleId = await sellTwo();

    expect(await chargeSaleOnStandaloneTerminalFor(deps(), { saleId, amount: 3000 })).toEqual({
      kind: "no_buyer_identification_threshold",
    });
    expect(database.prepare("SELECT state FROM sales").all()).toEqual([{ state: "OPEN" }]);
  });

  it("answers the domain's refusal of a sale whose total is zero", async () => {
    const saleId = await sellTwo();
    database.prepare("UPDATE sale_lines SET line_total = 0").run();

    expect(await chargeSaleOnStandaloneTerminalFor(deps(), { saleId, amount: 3000 })).toEqual({
      kind: "zero_total",
    });
  });

  it("answers the domain's refusal of a sale without lines", async () => {
    const saleId = await sellTwo();
    database.exec("DELETE FROM sale_line_promotions; DELETE FROM sale_lines");

    expect(await chargeSaleOnStandaloneTerminalFor(deps(), { saleId, amount: 3000 })).toEqual({
      kind: "empty_sale",
    });
  });

  it("answers that no session is open", async () => {
    const saleId = await sellTwo();
    database.prepare("UPDATE cash_sessions SET state = 'CLOSED', closed_at = 'x'").run();

    expect(await chargeSaleOnStandaloneTerminalFor(deps(), { saleId, amount: 3000 })).toEqual({
      kind: "no_open_session",
    });
  });

  it("answers not signed in when nobody is signed in", async () => {
    const saleId = await sellTwo();
    signedInPerson.clear();

    expect(await chargeSaleOnStandaloneTerminalFor(deps(), { saleId, amount: 3000 })).toEqual({
      kind: "not_signed_in",
    });
  });

  it("answers not permitted to a signed-in person without the permission to sell", async () => {
    const saleId = await sellTwo();
    addPerson("u2", "guest");
    signedInPerson.set("u2");

    expect(await chargeSaleOnStandaloneTerminalFor(deps(), { saleId, amount: 3000 })).toEqual({
      kind: "not_permitted",
    });
    expect(database.prepare("SELECT state FROM sales").all()).toEqual([{ state: "OPEN" }]);
    expect(database.prepare("SELECT count(*) AS total FROM payment_transactions").get()).toEqual({
      total: 0,
    });
  });

  it("answers unavailable, charging nothing, when the register holds no outbox chain key", async () => {
    const saleId = await sellTwo();

    expect(
      await chargeSaleOnStandaloneTerminalFor(deps({ readOutboxChainKey: async () => undefined }), {
        saleId,
        amount: 3000,
      }),
    ).toEqual({ kind: "unavailable" });
    expect(database.prepare("SELECT state FROM sales").all()).toEqual([{ state: "OPEN" }]);
  });
});

describe("what a sale in progress needs when an amount is tendered", () => {
  async function sellTwo(): Promise<string> {
    await scanProductFor(deps(), "111");
    const outcome = await scanProductFor(deps(), "111");
    if (outcome.kind !== "added") {
      throw new Error("test setup: the product was not added");
    }
    return outcome.sale.id;
  }

  it.each([
    [5000, { kind: "covered", applied: 3000, change: 2000, cash_rounding: 0 }],
    [3000, { kind: "covered", applied: 3000, change: 0, cash_rounding: 0 }],
    [1000, { kind: "partial", applied: 1000, pending: 2000 }],
    [0, { kind: "invalid_amount" }],
  ] as const)(
    "answers the domain's charge of %i against the total of the sale",
    async (tendered, charge) => {
      const saleId = await sellTwo();

      expect(await cashChargeFor(deps(), { saleId, tendered })).toEqual(charge);
    },
  );

  it("answers the charge against what is still pending once a payment was approved", async () => {
    const saleId = await sellTwo();
    await chargeSaleByTransferFor(deps(), { saleId, amount: 1200 });

    expect(await cashChargeFor(deps(), { saleId, tendered: 2000 })).toEqual({
      kind: "covered",
      applied: 1800,
      change: 200,
      cash_rounding: 0,
    });
    expect(await cashChargeFor(deps(), { saleId, tendered: 500 })).toEqual({
      kind: "partial",
      applied: 500,
      pending: 1300,
    });
  });

  it("charges nothing and changes nothing", async () => {
    const saleId = await sellTwo();

    await cashChargeFor(deps(), { saleId, tendered: 5000 });

    expect(database.prepare("SELECT state FROM sales").all()).toEqual([{ state: "OPEN" }]);
    expect(database.prepare("SELECT event_type FROM outbox").all()).toEqual([]);
  });

  it.each([
    [5000, 500, { kind: "covered", applied: 2500, change: 2500, cash_rounding: 0 }],
    [2500, 500, { kind: "covered", applied: 2500, change: 0, cash_rounding: 0 }],
    [1000, 500, { kind: "partial", applied: 1000, pending: 1500 }],
    [0, 500, { kind: "invalid_amount" }],
  ] as const)(
    "answers the charge of %i against the total once %i of discount is taken off",
    async (tendered, saleDiscount, charge) => {
      const saleId = await sellTwo();

      expect(await cashChargeFor(deps(), { saleId, tendered, saleDiscount })).toEqual(charge);
    },
  );

  it("answers the charge against the total the typed discount replaces, not the one the sale had", async () => {
    database
      .prepare(
        "INSERT INTO role_permissions (role_id, permission_key, active) VALUES ('cashier', 'apply_total_discount', 1)",
      )
      .run();
    const saleId = await sellTwo();
    await applySaleDiscountFor(deps(), {
      discount: { kind: "AMOUNT", value: 1000 },
      reason: "Cliente frecuente",
    });

    expect(await cashChargeFor(deps(), { saleId, tendered: 5000, saleDiscount: 500 })).toEqual({
      kind: "covered",
      applied: 2500,
      change: 2500,
      cash_rounding: 0,
    });
  });

  it("answers the refusal of a typed discount above the sale", async () => {
    const saleId = await sellTwo();

    expect(await cashChargeFor(deps(), { saleId, tendered: 5000, saleDiscount: 3001 })).toEqual({
      kind: "discount_exceeds_sale",
    });
  });

  it("answers that the typed discount cannot be applied once a payment was approved", async () => {
    const saleId = await sellTwo();
    await chargeSaleByTransferFor(deps(), { saleId, amount: 1200 });

    expect(await cashChargeFor(deps(), { saleId, tendered: 2000, saleDiscount: 100 })).toEqual({
      kind: "sale_has_payments",
    });
  });

  it("records nothing while previewing a typed discount", async () => {
    const saleId = await sellTwo();

    await cashChargeFor(deps(), { saleId, tendered: 5000, saleDiscount: 500 });

    expect(database.prepare("SELECT state, sale_discount_kind AS kind FROM sales").all()).toEqual([
      { state: "OPEN", kind: null },
    ]);
  });

  it("is none for a typed discount on a sale that is not the one in progress", async () => {
    await sellTwo();

    expect(
      await cashChargeFor(deps(), { saleId: "other-sale", tendered: 5000, saleDiscount: 500 }),
    ).toBeNull();
  });

  it("answers not permitted to a person without the permission to sell, typing a discount", async () => {
    const saleId = await sellTwo();
    addPerson("u2", "guest");
    signedInPerson.set("u2");

    expect(await cashChargeFor(deps(), { saleId, tendered: 5000, saleDiscount: 500 })).toBe(
      "not_permitted",
    );
  });

  it("is none for a sale that is not the one in progress", async () => {
    await sellTwo();

    expect(await cashChargeFor(deps(), { saleId: "other-sale", tendered: 5000 })).toBeNull();
  });

  it("is none when no session is open", async () => {
    const saleId = await sellTwo();
    database.prepare("UPDATE cash_sessions SET state = 'CLOSED', closed_at = 'x'").run();

    expect(await cashChargeFor(deps(), { saleId, tendered: 5000 })).toBeNull();
  });

  it("is none when nobody is signed in", async () => {
    const saleId = await sellTwo();
    signedInPerson.clear();

    expect(await cashChargeFor(deps(), { saleId, tendered: 5000 })).toBeNull();
  });

  it("answers not permitted to a signed-in person without the permission to sell", async () => {
    const saleId = await sellTwo();
    addPerson("u2", "guest");
    signedInPerson.set("u2");

    expect(await cashChargeFor(deps(), { saleId, tendered: 5000 })).toBe("not_permitted");
  });
});

describe("what a sale in progress needs when an amount is charged by another method", () => {
  async function sellTwo(): Promise<string> {
    await scanProductFor(deps(), "111");
    const outcome = await scanProductFor(deps(), "111");
    if (outcome.kind !== "added") {
      throw new Error("test setup: the product was not added");
    }
    return outcome.sale.id;
  }

  it.each([
    [3000, { kind: "covered", applied: 3000 }],
    [1000, { kind: "partial", applied: 1000, pending: 2000 }],
    [3001, { kind: "exceeds_pending", pending: 3000 }],
    [0, { kind: "invalid_amount" }],
  ] as const)(
    "answers the domain's charge of %i against the total of the sale",
    async (amount, charge) => {
      const saleId = await sellTwo();

      expect(await nonCashChargeFor(deps(), { saleId, amount })).toEqual(charge);
    },
  );

  it("answers the charge against what is still pending once a payment was approved", async () => {
    const saleId = await sellTwo();
    await chargeSaleByTransferFor(deps(), { saleId, amount: 1200 });

    expect(await nonCashChargeFor(deps(), { saleId, amount: 500 })).toEqual({
      kind: "partial",
      applied: 500,
      pending: 1300,
    });
  });

  it("charges nothing and changes nothing", async () => {
    const saleId = await sellTwo();

    await nonCashChargeFor(deps(), { saleId, amount: 1000 });

    expect(database.prepare("SELECT state FROM sales").all()).toEqual([{ state: "OPEN" }]);
    expect(database.prepare("SELECT event_type FROM outbox").all()).toEqual([]);
  });

  it("is none for a sale that is not the one in progress", async () => {
    await sellTwo();

    expect(await nonCashChargeFor(deps(), { saleId: "other-sale", amount: 1000 })).toBeNull();
  });

  it("is none when nobody is signed in", async () => {
    const saleId = await sellTwo();
    signedInPerson.clear();

    expect(await nonCashChargeFor(deps(), { saleId, amount: 1000 })).toBeNull();
  });

  it("answers not permitted to a signed-in person without the permission to sell", async () => {
    const saleId = await sellTwo();
    addPerson("u2", "guest");
    signedInPerson.set("u2");

    expect(await nonCashChargeFor(deps(), { saleId, amount: 1000 })).toBe("not_permitted");
  });
});

describe("cancelling the open sale of a locked register", () => {
  function lockedDeps(overrides: Partial<OutboxSaleRequestDeps> = {}): OutboxSaleRequestDeps {
    return deps({
      ids: idsStartingWith("cancelled"),
      gate: createActionGate({
        store: new SqliteSignInStore(database),
        signedInPerson,
        readPepper: async () => PEPPER,
        hashPin: async (pin) => (pin === CLOSER_PIN ? PIN_HASH : "hash-of-another-pin"),
        now: () => NOW,
      }),
      ...overrides,
    });
  }

  function addCloser(permissions: string[]): void {
    database
      .prepare(
        "INSERT INTO roles (id, name, is_administrator, version) VALUES ('closer', 'Encargada', 0, 1)",
      )
      .run();
    for (const key of permissions) {
      database
        .prepare(
          "INSERT INTO role_permissions (role_id, permission_key, active) VALUES ('closer', ?, 1)",
        )
        .run(key);
    }
    addPerson("u9", "closer");
    database
      .prepare("UPDATE users SET salt = ? WHERE id = 'u9'")
      .run(encodePinHash(new Uint8Array(16).fill(1)));
    database
      .prepare("INSERT INTO pin_verifiers (user_id, verifier) VALUES ('u9', ?)")
      .run(derivePinVerifier(PEPPER, PIN_HASH));
  }

  async function lockedWithOpenSale(): Promise<string> {
    const saleId = await sellTwoForPayments();
    signedInPerson.clear();
    return saleId;
  }

  async function lockedWithPartPaidSale(): Promise<string> {
    const saleId = await sellTwoForPayments();
    await chargeSaleInCashFor(deps({ ids: idsStartingWith("charged") }), {
      saleId,
      tendered: 1000,
    });
    signedInPerson.clear();
    return saleId;
  }

  function saleStates(): unknown[] {
    return database.prepare("SELECT state FROM sales").all();
  }

  it("empties an unpaid cart for the person whose PIN holds the permission, leaving nothing in the outbox", async () => {
    addCloser(["close_anothers_register_session"]);
    const saleId = await lockedWithOpenSale();

    expect(await cancelLockedSaleFor(lockedDeps(), { saleId, closer: CLOSER })).toEqual({
      kind: "cancelled",
      refunds: [],
    });

    expect(saleStates()).toEqual([]);
    expect(database.prepare("SELECT event_type FROM outbox").all()).toEqual([]);
  });

  it("leaves nobody signed in", async () => {
    addCloser(["close_anothers_register_session"]);
    const saleId = await lockedWithOpenSale();

    await cancelLockedSaleFor(lockedDeps(), { saleId, closer: CLOSER });

    expect(signedInPerson.userId()).toBeUndefined();
  });

  it("refuses a person without the permission, leaving the sale open", async () => {
    addCloser(["sell_and_charge"]);
    const saleId = await lockedWithOpenSale();

    expect(await cancelLockedSaleFor(lockedDeps(), { saleId, closer: CLOSER })).toEqual({
      kind: "lacks_permission",
    });
    expect(saleStates()).toEqual([{ state: "OPEN" }]);
  });

  it("refuses the person who opened the session, leaving the sale open", async () => {
    addCloser(["close_anothers_register_session"]);
    const saleId = await lockedWithOpenSale();
    database.prepare("UPDATE cash_sessions SET opened_by = 'u9'").run();

    expect(await cancelLockedSaleFor(lockedDeps(), { saleId, closer: CLOSER })).toEqual({
      kind: "lacks_permission",
    });
    expect(saleStates()).toEqual([{ state: "OPEN" }]);
  });

  it("refuses a wrong PIN, leaving the sale open", async () => {
    addCloser(["close_anothers_register_session"]);
    const saleId = await lockedWithOpenSale();

    const outcome = await cancelLockedSaleFor(lockedDeps(), {
      saleId,
      closer: { user_id: "u9", pin: "0000" },
    });

    expect(outcome.kind).toBe("wrong_pin");
    expect(saleStates()).toEqual([{ state: "OPEN" }]);
  });

  it("refuses while someone is signed in, leaving the sale open", async () => {
    addCloser(["close_anothers_register_session"]);
    const saleId = await sellTwoForPayments();

    expect(await cancelLockedSaleFor(lockedDeps(), { saleId, closer: CLOSER })).toEqual({
      kind: "not_locked",
    });
    expect(saleStates()).toEqual([{ state: "OPEN" }]);
  });

  it("answers that there is no sale to cancel", async () => {
    addCloser(["close_anothers_register_session"]);
    signedInPerson.clear();

    expect(await cancelLockedSaleFor(lockedDeps(), { saleId: "id-1", closer: CLOSER })).toEqual({
      kind: "no_open_sale",
    });
  });

  it("refuses when no session is open", async () => {
    addCloser(["close_anothers_register_session"]);
    const saleId = await lockedWithOpenSale();
    database.prepare("UPDATE cash_sessions SET state = 'CLOSED', closed_at = 'x'").run();

    expect(await cancelLockedSaleFor(lockedDeps(), { saleId, closer: CLOSER })).toEqual({
      kind: "lacks_permission",
    });
  });

  it("cancels a part-paid sale, giving the cash back as a refund movement of the closer", async () => {
    addCloser(["close_anothers_register_session", "void_sale"]);
    const saleId = await lockedWithPartPaidSale();
    const [payment] = database
      .prepare<[], { id: string }>("SELECT id FROM payment_transactions")
      .all();

    expect(await cancelLockedSaleFor(lockedDeps(), { saleId, closer: CLOSER })).toEqual({
      kind: "cancelled",
      refunds: [
        {
          payment_id: payment?.id,
          method: "CASH",
          amount: 1000,
          state: "APPROVED",
          sent_by_cloud: false,
        },
      ],
    });

    expect(saleStates()).toEqual([{ state: "CANCELLED" }]);
    expect(
      database
        .prepare(
          "SELECT type, amount, actor_id, authorized_by FROM cash_movements WHERE type = 'REFUND'",
        )
        .all(),
    ).toEqual([{ type: "REFUND", amount: 1000, actor_id: "u9", authorized_by: "u9" }]);
    expect(database.prepare("SELECT event_type FROM outbox").all()).toEqual([
      { event_type: "sale_cancelled" },
    ]);
  });

  it("counts the payment and its refund in the cash expected at closing, which ends up as the opening float", async () => {
    addCloser(["close_anothers_register_session", "void_sale"]);
    const saleId = await lockedWithPartPaidSale();

    await cancelLockedSaleFor(lockedDeps(), { saleId, closer: CLOSER });

    expect(cashBalanceFor(database)).toMatchObject({
      cash_sales: { amount: 1000 },
      refunds: { amount: 1000 },
      expected: 0,
    });
  });

  it("leaves a transfer refund pending when it cancels a sale paid by transfer", async () => {
    addCloser(["close_anothers_register_session", "void_sale"]);
    const saleId = await sellTwoForPayments();
    await chargeSaleByTransferFor(deps({ ids: idsStartingWith("charged") }), {
      saleId,
      amount: 1000,
    });
    signedInPerson.clear();

    expect(await cancelLockedSaleFor(lockedDeps(), { saleId, closer: CLOSER })).toMatchObject({
      kind: "cancelled",
      refunds: [{ method: "TRANSFER", state: "PENDING" }],
    });
    expect(database.prepare("SELECT method, state FROM payment_refunds").all()).toEqual([
      { method: "TRANSFER", state: "PENDING" },
    ]);
  });

  it("leaves a standalone terminal refund pending when it cancels a sale paid there", async () => {
    addCloser(["close_anothers_register_session", "void_sale"]);
    const saleId = await sellTwoForPayments();
    await chargeSaleOnStandaloneTerminalFor(deps({ ids: idsStartingWith("charged") }), {
      saleId,
      amount: 1000,
    });
    signedInPerson.clear();

    expect(await cancelLockedSaleFor(lockedDeps(), { saleId, closer: CLOSER })).toMatchObject({
      kind: "cancelled",
      refunds: [{ method: "STANDALONE_TERMINAL", state: "PENDING" }],
    });
    expect(database.prepare("SELECT method, state FROM payment_refunds").all()).toEqual([
      { method: "STANDALONE_TERMINAL", state: "PENDING" },
    ]);
    expect(database.prepare("SELECT id FROM cash_movements WHERE type = 'REFUND'").all()).toEqual(
      [],
    );
  });

  it("leaves a QR refund pending when it cancels a sale paid there", async () => {
    addCloser(["close_anothers_register_session", "void_sale"]);
    const saleId = await sellTwoForPayments();
    database
      .prepare(
        "INSERT INTO payment_transactions (id, sale_id, kind, method, provider, amount, state, occurred_at, wait_ends_at) VALUES ('qr-1', ?, 'SALE', 'QR', 'MERCADOPAGO_QR', 1000, 'APPROVED', ?, ?)",
      )
      .run(saleId, NOW.toISOString(), NOW.toISOString());
    signedInPerson.clear();

    expect(await cancelLockedSaleFor(lockedDeps(), { saleId, closer: CLOSER })).toMatchObject({
      kind: "cancelled",
      refunds: [{ method: "QR", state: "PENDING" }],
    });
    expect(database.prepare("SELECT method, provider, state FROM payment_refunds").all()).toEqual([
      { method: "QR", provider: "MERCADOPAGO_QR", state: "PENDING" },
    ]);
    expect(database.prepare("SELECT id FROM cash_movements WHERE type = 'REFUND'").all()).toEqual(
      [],
    );
  });

  it("refuses a closer who may not void a sale with approved payments, changing nothing", async () => {
    addCloser(["close_anothers_register_session"]);
    const saleId = await lockedWithPartPaidSale();

    expect(await cancelLockedSaleFor(lockedDeps(), { saleId, closer: CLOSER })).toEqual({
      kind: "not_permitted",
    });
    expect(saleStates()).toEqual([{ state: "OPEN" }]);
    expect(database.prepare("SELECT id FROM payment_refunds").all()).toEqual([]);
    expect(database.prepare("SELECT id FROM cash_movements WHERE type = 'REFUND'").all()).toEqual(
      [],
    );
    expect(database.prepare("SELECT event_type FROM outbox").all()).toEqual([]);
  });

  it("empties an unpaid cart even when the register has no outbox key yet, since nothing is recorded", async () => {
    addCloser(["close_anothers_register_session"]);
    const saleId = await lockedWithOpenSale();

    expect(
      await cancelLockedSaleFor(lockedDeps({ readOutboxChainKey: async () => undefined }), {
        saleId,
        closer: CLOSER,
      }),
    ).toEqual({ kind: "cancelled", refunds: [] });
    expect(saleStates()).toEqual([]);
  });

  it("answers that it is unavailable for a part-paid sale when the register has no outbox key yet, changing nothing", async () => {
    addCloser(["close_anothers_register_session", "void_sale"]);
    const saleId = await lockedWithPartPaidSale();
    const movementsBefore = database.prepare("SELECT id FROM cash_movements").all();

    expect(
      await cancelLockedSaleFor(lockedDeps({ readOutboxChainKey: async () => undefined }), {
        saleId,
        closer: CLOSER,
      }),
    ).toEqual({ kind: "unavailable" });
    expect(saleStates()).toEqual([{ state: "OPEN" }]);
    expect(database.prepare("SELECT id FROM payment_refunds").all()).toEqual([]);
    expect(database.prepare("SELECT id FROM cash_movements").all()).toEqual(movementsBefore);
    expect(database.prepare("SELECT event_type FROM outbox").all()).toEqual([]);
  });

  it("refuses a sale that is not the open one", async () => {
    addCloser(["close_anothers_register_session"]);
    await lockedWithOpenSale();

    expect(
      await cancelLockedSaleFor(lockedDeps(), { saleId: "another-sale", closer: CLOSER }),
    ).toEqual({ kind: "no_open_sale" });
    expect(saleStates()).toEqual([{ state: "OPEN" }]);
  });
});

describe("editing the lines of a sale with an approved payment", () => {
  async function sellTwoPartlyPaid(): Promise<void> {
    const saleId = await sellTwoForPayments();
    await chargeSaleInCashFor(deps(), { saleId, tendered: 1000 });
  }

  it("answers that a scanned product cannot be added", async () => {
    await sellTwoPartlyPaid();

    expect(await scanProductFor(deps(), "111")).toEqual({ kind: "sale_has_payments" });
  });

  it("answers that a searched product cannot be added", async () => {
    await sellTwoPartlyPaid();

    expect(await addSearchedProductFor(deps(), "p1")).toEqual({ kind: "sale_has_payments" });
  });

  it("answers that a line's quantity cannot change", async () => {
    await sellTwoPartlyPaid();

    expect(await changeLineQuantityFor(deps(), "id-2", 1, 2)).toEqual({
      kind: "sale_has_payments",
    });
  });

  it("answers that a line cannot be removed", async () => {
    await sellTwoPartlyPaid();

    expect(await removeSaleLineFor(deps(), "id-2")).toEqual({ kind: "sale_has_payments" });
  });
});

describe("cancelling the sale in progress after a payment was approved", () => {
  const ids = idsStartingWith("cancelled");

  function withPins(overrides: Partial<OutboxSaleRequestDeps> = {}): OutboxSaleRequestDeps {
    return deps({ gate: pinGate(), ids, ...overrides });
  }

  async function partlyPaidInCash(): Promise<string> {
    const saleId = await sellTwoForPayments();
    await chargeSaleInCashFor(deps({ ids }), { saleId, tendered: 1000 });
    return saleId;
  }

  function saleStates(): unknown[] {
    return database.prepare("SELECT state FROM sales").all();
  }

  it("cancels it for a person with the void sale permission, giving the cash back", async () => {
    addPersonWithPin("u2", "Grace", ["sell_and_charge", "void_sale"]);
    database.prepare("UPDATE cash_sessions SET opened_by = 'u2'").run();
    signedInPerson.set("u2");
    const saleId = await partlyPaidInCash();
    const [payment] = database
      .prepare<[], { id: string }>("SELECT id FROM payment_transactions")
      .all();

    expect(await cancelPaidSaleFor(withPins(), { saleId })).toEqual({
      kind: "cancelled",
      refunds: [
        {
          payment_id: payment?.id,
          method: "CASH",
          amount: 1000,
          state: "APPROVED",
          sent_by_cloud: false,
        },
      ],
      authorized_by: null,
    });
    expect(saleStates()).toEqual([{ state: "CANCELLED" }]);
    expect(
      database
        .prepare(
          "SELECT type, amount, actor_id, authorized_by FROM cash_movements WHERE type = 'REFUND'",
        )
        .all(),
    ).toEqual([{ type: "REFUND", amount: 1000, actor_id: "u2", authorized_by: null }]);
  });

  it("cancels it while it holds an approved standalone terminal payment, leaving its refund pending with no cash movement and telling the cloud", async () => {
    addPersonWithPin("u2", "Grace", ["sell_and_charge", "void_sale"]);
    database.prepare("UPDATE cash_sessions SET opened_by = 'u2'").run();
    signedInPerson.set("u2");
    const saleId = await sellTwoForPayments();
    await chargeSaleOnStandaloneTerminalFor(deps({ ids }), { saleId, amount: 1000 });
    const [payment] = database
      .prepare<[], { id: string }>("SELECT id FROM payment_transactions")
      .all();

    expect(await cancelPaidSaleFor(withPins(), { saleId })).toEqual({
      kind: "cancelled",
      refunds: [
        {
          payment_id: payment?.id,
          method: "STANDALONE_TERMINAL",
          amount: 1000,
          state: "PENDING",
          sent_by_cloud: false,
        },
      ],
      authorized_by: null,
    });
    expect(saleStates()).toEqual([{ state: "CANCELLED" }]);
    expect(
      database.prepare("SELECT method, provider, amount, state FROM payment_refunds").all(),
    ).toEqual([
      {
        method: "STANDALONE_TERMINAL",
        provider: "EXTERNAL_TERMINAL",
        amount: 1000,
        state: "PENDING",
      },
    ]);
    expect(database.prepare("SELECT id FROM cash_movements WHERE type = 'REFUND'").all()).toEqual(
      [],
    );
    expect(database.prepare("SELECT event_type, schema_version FROM outbox").all()).toEqual([
      { event_type: "sale_cancelled", schema_version: 10 },
    ]);
  });

  it("cancels it while it holds an approved QR payment, leaving its refund pending with no cash movement and telling the cloud", async () => {
    addPersonWithPin("u2", "Grace", ["sell_and_charge", "void_sale"]);
    database.prepare("UPDATE cash_sessions SET opened_by = 'u2'").run();
    signedInPerson.set("u2");
    const saleId = await sellTwoForPayments();
    database
      .prepare(
        "INSERT INTO payment_transactions (id, sale_id, kind, method, provider, amount, state, occurred_at, wait_ends_at) VALUES ('qr-1', ?, 'SALE', 'QR', 'MERCADOPAGO_QR', 1000, 'APPROVED', ?, ?)",
      )
      .run(saleId, NOW.toISOString(), NOW.toISOString());

    expect(await cancelPaidSaleFor(withPins(), { saleId })).toEqual({
      kind: "cancelled",
      refunds: [
        { payment_id: "qr-1", method: "QR", amount: 1000, state: "PENDING", sent_by_cloud: true },
      ],
      authorized_by: null,
    });
    expect(saleStates()).toEqual([{ state: "CANCELLED" }]);
    expect(
      database.prepare("SELECT method, provider, amount, state FROM payment_refunds").all(),
    ).toEqual([{ method: "QR", provider: "MERCADOPAGO_QR", amount: 1000, state: "PENDING" }]);
    expect(database.prepare("SELECT id FROM cash_movements WHERE type = 'REFUND'").all()).toEqual(
      [],
    );
    expect(database.prepare("SELECT event_type, schema_version FROM outbox").all()).toEqual([
      { event_type: "sale_cancelled", schema_version: 10 },
    ]);
  });

  it("cancels it while it holds an approved payment on the integrated terminal, leaving its refund pending for the cloud to send, with no cash movement, and telling the cloud", async () => {
    addPersonWithPin("u2", "Grace", ["sell_and_charge", "void_sale"]);
    database.prepare("UPDATE cash_sessions SET opened_by = 'u2'").run();
    signedInPerson.set("u2");
    const saleId = await sellTwoForPayments();
    database
      .prepare(
        "INSERT INTO payment_transactions (id, sale_id, kind, method, provider, card_type, amount, state, occurred_at, wait_ends_at) VALUES ('point-1', ?, 'SALE', 'POINT', 'MERCADOPAGO_POINT', 'DEBIT', 1000, 'APPROVED', ?, ?)",
      )
      .run(saleId, NOW.toISOString(), NOW.toISOString());

    expect(await cancelPaidSaleFor(withPins(), { saleId })).toEqual({
      kind: "cancelled",
      refunds: [
        {
          payment_id: "point-1",
          method: "POINT",
          amount: 1000,
          state: "PENDING",
          sent_by_cloud: true,
        },
      ],
      authorized_by: null,
    });
    expect(saleStates()).toEqual([{ state: "CANCELLED" }]);
    expect(
      database.prepare("SELECT method, provider, amount, state FROM payment_refunds").all(),
    ).toEqual([{ method: "POINT", provider: "MERCADOPAGO_POINT", amount: 1000, state: "PENDING" }]);
    expect(database.prepare("SELECT id FROM cash_movements WHERE type = 'REFUND'").all()).toEqual(
      [],
    );
    expect(database.prepare("SELECT event_type, schema_version FROM outbox").all()).toEqual([
      { event_type: "sale_cancelled", schema_version: 10 },
    ]);
  });

  it("cancels it with the PIN of a person who holds the permission, naming who authorized it", async () => {
    addPersonWithPin("u2", "Grace", ["void_sale"]);
    const saleId = await partlyPaidInCash();

    expect(
      await cancelPaidSaleFor(withPins(), {
        saleId,
        authorization: { user_id: "u2", pin: CLOSER_PIN },
      }),
    ).toMatchObject({
      kind: "cancelled",
      authorized_by: { user_id: "u2", first_name: "Grace" },
    });
    expect(database.prepare("SELECT state, cancellation_authorized_by FROM sales").all()).toEqual([
      { state: "CANCELLED", cancellation_authorized_by: "u2" },
    ]);
    expect(
      database
        .prepare("SELECT actor_id, authorized_by FROM cash_movements WHERE type = 'REFUND'")
        .all(),
    ).toEqual([{ actor_id: "u1", authorized_by: "u2" }]);
  });

  it("leaves a transfer refund pending", async () => {
    addPersonWithPin("u2", "Grace", ["void_sale"]);
    const saleId = await sellTwoForPayments();
    await chargeSaleByTransferFor(deps({ ids }), { saleId, amount: 1000 });

    expect(
      await cancelPaidSaleFor(withPins(), {
        saleId,
        authorization: { user_id: "u2", pin: CLOSER_PIN },
      }),
    ).toMatchObject({ kind: "cancelled", refunds: [{ method: "TRANSFER", state: "PENDING" }] });
    expect(database.prepare("SELECT method, state FROM payment_refunds").all()).toEqual([
      { method: "TRANSFER", state: "PENDING" },
    ]);
  });

  it("refuses a cashier without the permission who brings no authorization, changing nothing", async () => {
    const saleId = await partlyPaidInCash();

    expect(await cancelPaidSaleFor(withPins(), { saleId })).toEqual({ kind: "lacks_permission" });
    expect(saleStates()).toEqual([{ state: "OPEN" }]);
  });

  it("refuses a wrong PIN, changing nothing", async () => {
    addPersonWithPin("u2", "Grace", ["void_sale"]);
    const saleId = await partlyPaidInCash();

    const outcome = await cancelPaidSaleFor(withPins(), {
      saleId,
      authorization: { user_id: "u2", pin: "0000" },
    });

    expect(outcome.kind).toBe("wrong_pin");
    expect(saleStates()).toEqual([{ state: "OPEN" }]);
  });

  it("refuses the PIN of a person who lacks the permission, changing nothing", async () => {
    addPersonWithPin("u2", "Grace", ["sell_and_charge"]);
    const saleId = await partlyPaidInCash();

    expect(
      await cancelPaidSaleFor(withPins(), {
        saleId,
        authorization: { user_id: "u2", pin: CLOSER_PIN },
      }),
    ).toEqual({ kind: "lacks_permission" });
    expect(saleStates()).toEqual([{ state: "OPEN" }]);
  });

  it("answers that the sale asked for is not the one in progress", async () => {
    await partlyPaidInCash();
    addPersonWithPin("u2", "Grace", ["void_sale"]);

    expect(
      await cancelPaidSaleFor(withPins(), {
        saleId: "another-sale",
        authorization: { user_id: "u2", pin: CLOSER_PIN },
      }),
    ).toEqual({ kind: "no_open_sale" });
    expect(saleStates()).toEqual([{ state: "OPEN" }]);
  });

  it("answers not signed in when nobody is signed in", async () => {
    const saleId = await partlyPaidInCash();
    signedInPerson.clear();

    expect(await cancelPaidSaleFor(withPins(), { saleId })).toEqual({ kind: "not_signed_in" });
  });

  it("answers that no session is open", async () => {
    addPersonWithPin("u2", "Grace", ["void_sale"]);
    const saleId = await partlyPaidInCash();
    database.prepare("UPDATE cash_sessions SET state = 'CLOSED', closed_at = 'x'").run();

    expect(
      await cancelPaidSaleFor(withPins(), {
        saleId,
        authorization: { user_id: "u2", pin: CLOSER_PIN },
      }),
    ).toEqual({ kind: "no_open_session" });
  });

  it("answers not permitted to a person who sells but did not open the session", async () => {
    addPersonWithPin("u2", "Grace", ["void_sale"]);
    addPersonWithPin("u3", "Bruno", ["sell_and_charge"]);
    const saleId = await partlyPaidInCash();
    signedInPerson.set("u3");

    expect(
      await cancelPaidSaleFor(withPins(), {
        saleId,
        authorization: { user_id: "u2", pin: CLOSER_PIN },
      }),
    ).toEqual({ kind: "not_permitted" });
    expect(saleStates()).toEqual([{ state: "OPEN" }]);
  });

  it("answers unavailable, cancelling nothing, when the register holds no outbox chain key", async () => {
    addPersonWithPin("u2", "Grace", ["void_sale"]);
    const saleId = await partlyPaidInCash();

    expect(
      await cancelPaidSaleFor(withPins({ readOutboxChainKey: async () => undefined }), {
        saleId,
        authorization: { user_id: "u2", pin: CLOSER_PIN },
      }),
    ).toEqual({ kind: "unavailable" });
    expect(saleStates()).toEqual([{ state: "OPEN" }]);
  });

  it("empties a cart without approved payments even when the register holds no outbox chain key", async () => {
    addPersonWithPin("u2", "Grace", ["void_sale"]);
    const saleId = await sellTwoForPayments();

    expect(
      await cancelPaidSaleFor(withPins({ readOutboxChainKey: async () => undefined }), {
        saleId,
        authorization: { user_id: "u2", pin: CLOSER_PIN },
      }),
    ).toMatchObject({ kind: "cancelled" });
    expect(saleStates()).toEqual([]);
  });

  it("leaves no sale in progress", async () => {
    addPersonWithPin("u2", "Grace", ["void_sale"]);
    const saleId = await partlyPaidInCash();
    await cancelPaidSaleFor(withPins(), {
      saleId,
      authorization: { user_id: "u2", pin: CLOSER_PIN },
    });

    expect(await currentSaleFor(deps())).toBeNull();
  });
});
