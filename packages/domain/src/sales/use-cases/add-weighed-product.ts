import type { Clock } from "../../shared/index.js";
import { mayBeSaleLineQuantity, newWeighedSaleLine } from "../model/sale-line.js";
import {
  type AddedLineOutcome,
  addLineToSale,
  isSaleAdditionRefusal,
  type SaleAdditionRefusal,
  saleToAddTo,
  validPromotions,
} from "./sale-addition.js";
import type { IdGenerator, SaleLedger } from "./sale-ledger.js";

export interface AddWeighedProductInput {
  actorId: string;
  productId: string;
  weightThousandths: number;
}

export interface AddWeighedProductPorts {
  ledger: SaleLedger;
  clock: Clock;
  ids: IdGenerator;
}

export type AddWeighedProductOutcome =
  | SaleAdditionRefusal
  | { kind: "product_unavailable" }
  | { kind: "not_sold_by_weight" }
  | { kind: "invalid_weight" }
  | { kind: "no_price"; productName: string }
  | AddedLineOutcome;

export function addWeighedProduct(
  { ledger, clock, ids }: AddWeighedProductPorts,
  { actorId, productId, weightThousandths }: AddWeighedProductInput,
): AddWeighedProductOutcome {
  return ledger.transaction<AddWeighedProductOutcome>((tx) => {
    const addition = saleToAddTo(tx, actorId, clock);
    if (isSaleAdditionRefusal(addition)) {
      return addition;
    }

    const product = tx.activeProductById(productId);
    if (!product) {
      return { kind: "product_unavailable" };
    }
    if (product.saleUnit !== "KG") {
      return { kind: "not_sold_by_weight" };
    }
    if (!mayBeSaleLineQuantity(weightThousandths, "KG")) {
      return { kind: "invalid_weight" };
    }
    const moment = clock.now();
    const price = tx.priceAt(product.id, moment);
    if (!price) {
      return { kind: "no_price", productName: product.name };
    }
    return addLineToSale(tx, addition, ids, moment, (lineId) =>
      newWeighedSaleLine(
        lineId,
        product,
        price,
        validPromotions(tx, product.id, moment),
        weightThousandths,
        "MANUAL",
      ),
    );
  });
}
