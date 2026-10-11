import type { Clock } from "../../shared/index.js";
import { mayBeSaleLineQuantity } from "../model/sale-line.js";
import {
  type AddedLineOutcome,
  isSaleAdditionRefusal,
  type SaleAdditionRefusal,
  saleToAddTo,
} from "./sale-addition.js";
import type { IdGenerator, SaleLedger } from "./sale-ledger.js";
import {
  addWeighedLine,
  isNoPrice,
  isWeighedProductRefusal,
  pricedWeighedProduct,
  type WeighedProductRefusal,
  weighedProductToAdd,
} from "./weighed-line-addition.js";

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
  | WeighedProductRefusal
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

    const product = weighedProductToAdd(tx, productId);
    if (isWeighedProductRefusal(product)) {
      return product;
    }
    if (!mayBeSaleLineQuantity(weightThousandths, "KG")) {
      return { kind: "invalid_weight" };
    }
    const priced = pricedWeighedProduct(tx, clock, product);
    if (isNoPrice(priced)) {
      return priced;
    }
    return addWeighedLine(tx, addition, ids, priced, weightThousandths, "MANUAL");
  });
}
