import type { ConsultProductOutcome, ProductToConsult } from "@purosur/contracts";
import { consultProduct, type Scale } from "@purosur/domain/sales/use-cases";
import { SqliteSignInStore } from "../sessions/sqlite-sign-in-store";
import type { SaleRequestDeps } from "./sale-requests";
import { SqliteSaleLedger } from "./sqlite-sale-ledger";

export type ProductConsultationDeps = Pick<
  SaleRequestDeps,
  "database" | "gate" | "restoration" | "now" | "zoneRules"
> & { scale: Scale };

export async function consultProductFor(
  { database, gate, restoration, now, zoneRules, scale }: ProductConsultationDeps,
  product: ProductToConsult,
): Promise<ConsultProductOutcome> {
  const guarded = await gate.run({ kind: "sell" }, async ({ signedInUserId }) =>
    consultProduct(
      {
        ledger: new SqliteSaleLedger(database, new SqliteSignInStore(database)),
        restoration,
        clock: { now },
        zoneRules,
        scale,
      },
      {
        actorId: signedInUserId,
        product: "barcode" in product ? product : { productId: product.product_id },
      },
    ),
  );
  if (guarded.kind !== "performed") {
    return { kind: guarded.kind === "not_signed_in" ? "not_signed_in" : "not_permitted" };
  }
  const outcome = guarded.result;
  if (outcome.kind !== "consulted") {
    return { kind: outcome.kind };
  }
  return {
    kind: "consulted",
    product_id: outcome.product.id,
    name: outcome.product.name,
    sale_unit: outcome.product.saleUnit,
    unit_price: outcome.unitPrice,
    promotion: outcome.promotion && {
      benefit:
        outcome.promotion.benefit.kind === "PERCENT_OFF"
          ? outcome.promotion.benefit
          : {
              kind: "BUY_N_PAY_M",
              buy_qty: outcome.promotion.benefit.buyQty,
              pay_qty: outcome.promotion.benefit.payQty,
            },
      weekdays: [...outcome.promotion.weekdays],
    },
    weight_thousandths: outcome.weightThousandths,
    amount: outcome.amount,
    stock_thousandths: outcome.stockThousandths,
  };
}
