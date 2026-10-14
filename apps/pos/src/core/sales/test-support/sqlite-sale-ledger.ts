import type { DiscountBenefit } from "@purosur/domain";
import type { LocalDatabase } from "../../platform/local-database";
import { LOCAL_MIGRATIONS } from "../../platform/local-migrations";
import { migrationClock } from "../../platform/test-support/migration-clock";
import { openLocalDatabase } from "../../platform/test-support/open-local-database";
import { SqliteSaleLedger } from "../sqlite-sale-ledger";

export interface LedgerWithOpenSale {
  database: LocalDatabase;
  ledger: SqliteSaleLedger;
}

export function ledgerWithOpenSale(): LedgerWithOpenSale {
  const database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
  database.exec(
    `INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
     VALUES ('session-1', 'register-1', 'device-1', 'u1', '2026-10-09T08:00:00.000Z', 0, 'OPEN');
     INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at)
     VALUES ('sale-1', 'register-1', 'device-1', 'session-1', 'u1', 'OPEN', NULL);`,
  );
  return { database, ledger: new SqliteSaleLedger(database, { activePerson: () => undefined }) };
}

interface ProductOptions {
  id?: string;
  name?: string;
  unit?: string;
  categoryId?: string;
  active?: boolean;
  removed?: boolean;
}

export function addProduct(
  database: LocalDatabase,
  code: string | undefined,
  options: ProductOptions = {},
): string {
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
    addBarcode(database, id, code);
  }
  return id;
}

export function addBarcode(
  database: LocalDatabase,
  productId: string,
  code: string,
  active = true,
  position = 1,
): void {
  database
    .prepare(
      "INSERT INTO product_barcodes (product_id, position, code, active) VALUES (?, ?, ?, ?)",
    )
    .run(productId, position, code, active ? 1 : 0);
}

export function addPrice(
  database: LocalDatabase,
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

export function addCategory(
  database: LocalDatabase,
  id: string,
  parentId: string | null = null,
): void {
  database
    .prepare("INSERT INTO categories (id, name, parent_id, version) VALUES (?, ?, ?, 1)")
    .run(id, id, parentId);
}

export function addProductTag(
  database: LocalDatabase,
  productId: string,
  tagId: string,
  active = true,
): void {
  database
    .prepare("INSERT INTO product_tags (product_id, tag_id, active) VALUES (?, ?, ?)")
    .run(productId, tagId, active ? 1 : 0);
}

interface DiscountOptions {
  name?: string;
  active?: boolean;
  removed?: boolean;
  validFrom?: string;
  validTo?: string;
  weekdays?: number[];
}

export function addDiscount(
  database: LocalDatabase,
  id: string,
  target: { kind: "PRODUCT" | "CATEGORY" | "TAG"; id: string },
  benefit: DiscountBenefit,
  options: DiscountOptions = {},
): void {
  database
    .prepare(
      `INSERT INTO discounts (
         id, name, kind, percent, buy_qty, pay_qty, target_kind, target_id, valid_from, valid_to,
         weekdays, active, version, removed
       ) VALUES (
         @id, @name, @kind, @percent, @buy_qty, @pay_qty, @target_kind, @target_id, @valid_from,
         @valid_to, @weekdays, @active, 1, @removed
       )`,
    )
    .run({
      id,
      name: options.name ?? "Promo",
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

export function promotionIdsTargeting(ledger: SqliteSaleLedger, productId: string): string[] {
  return ledger
    .transaction((tx) => tx.promotionsTargeting(productId))
    .map((promotion) => promotion.id);
}
