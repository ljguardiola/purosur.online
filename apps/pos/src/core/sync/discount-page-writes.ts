import type { SyncChange } from "@purosur/contracts";
import type { LocalDatabase } from "../platform/local-database";
import type { RemovalOf } from "./pulled-change";

type DiscountBenefit = Extract<SyncChange, { entity: "discount" }>["row"]["benefit"];

function benefitColumns(benefit: DiscountBenefit) {
  switch (benefit.kind) {
    case "PERCENT_OFF":
      return { kind: benefit.kind, percent: benefit.percent, buy_qty: null, pay_qty: null };
    case "BUY_N_PAY_M":
      return {
        kind: benefit.kind,
        percent: null,
        buy_qty: benefit.buyQty,
        pay_qty: benefit.payQty,
      };
  }
}

export function prepareDiscountPageWrites(database: LocalDatabase) {
  const saveDiscount = database.prepare(
    `INSERT INTO discounts (
       id, name, kind, percent, buy_qty, pay_qty, target_kind, target_id, valid_from, valid_to,
       weekdays, active, version, removed
     ) VALUES (
       @id, @name, @kind, @percent, @buy_qty, @pay_qty, @target_kind, @target_id, @valid_from,
       @valid_to, @weekdays, @active, @version, 0
     )
     ON CONFLICT (id) DO UPDATE SET
       name = excluded.name,
       kind = excluded.kind,
       percent = excluded.percent,
       buy_qty = excluded.buy_qty,
       pay_qty = excluded.pay_qty,
       target_kind = excluded.target_kind,
       target_id = excluded.target_id,
       valid_from = excluded.valid_from,
       valid_to = excluded.valid_to,
       weekdays = excluded.weekdays,
       active = excluded.active,
       version = excluded.version,
       removed = 0
     WHERE excluded.version > discounts.version`,
  );
  const removeDiscount = database.prepare(
    "UPDATE discounts SET removed = 1, version = @version WHERE id = @id AND version < @version",
  );

  return {
    save({ entity_id, row }: Extract<SyncChange, { entity: "discount" }>): void {
      saveDiscount.run({
        id: entity_id,
        name: row.name,
        ...benefitColumns(row.benefit),
        target_kind: row.target.kind,
        target_id: row.target.id,
        valid_from: row.valid_from,
        valid_to: row.valid_to,
        weekdays: JSON.stringify(row.weekdays),
        active: row.active ? 1 : 0,
        version: row.version,
      });
    },

    removal({ entity_id, version }: RemovalOf<"discount">): void {
      removeDiscount.run({ id: entity_id, version });
    },
  };
}
