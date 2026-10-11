import type { Clock } from "../../shared/index.js";
import { mayBeSaleLineQuantity } from "../model/sale-line.js";
import type { AddedLineOutcome, SaleAdditionRefusal } from "./sale-addition.js";
import { isSaleAdditionRefusal, saleToAddTo } from "./sale-addition.js";
import type { IdGenerator, SaleLedger } from "./sale-ledger.js";
import type { Scale } from "./scale.js";
import {
  addWeighedLine,
  isNoPrice,
  isWeighedProductRefusal,
  pricedWeighedProduct,
  type WeighedProductRefusal,
  weighedProductToAdd,
} from "./weighed-line-addition.js";

export interface WeighProductOnScaleInput {
  actorId: string;
  productId: string;
}

export interface WeighProductOnScalePorts {
  ledger: SaleLedger;
  clock: Clock;
  ids: IdGenerator;
  scale: Scale;
}

export type WeighProductOnScaleOutcome =
  | SaleAdditionRefusal
  | WeighedProductRefusal
  | { kind: "no_price"; productName: string }
  | { kind: "weighing" }
  | { kind: "scale_unavailable" }
  | AddedLineOutcome;

export async function weighProductOnScale(
  { ledger, clock, ids, scale }: WeighProductOnScalePorts,
  { actorId, productId }: WeighProductOnScaleInput,
): Promise<WeighProductOnScaleOutcome> {
  const reading = await scale.read();
  return ledger.transaction<WeighProductOnScaleOutcome>((tx) => {
    const addition = saleToAddTo(tx, actorId, clock);
    if (isSaleAdditionRefusal(addition)) {
      return addition;
    }
    const product = weighedProductToAdd(tx, productId);
    if (isWeighedProductRefusal(product)) {
      return product;
    }
    const priced = pricedWeighedProduct(tx, clock, product);
    if (isNoPrice(priced)) {
      return priced;
    }
    if (reading.kind === "unavailable") {
      return { kind: "scale_unavailable" };
    }
    if (reading.kind === "not_stable" || !mayBeSaleLineQuantity(reading.weightThousandths, "KG")) {
      return { kind: "weighing" };
    }
    return addWeighedLine(tx, addition, ids, priced, reading.weightThousandths, "SCALE");
  });
}
