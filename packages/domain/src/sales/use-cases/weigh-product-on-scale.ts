import type { Clock, Scale, ZoneRulesSource } from "../../shared/index.js";
import { newWeighedSaleLine } from "../model/sale-line.js";
import type { RegisterRestoration } from "./register-restoration.js";
import type { AddedLineOutcome, SaleAdditionRefusal } from "./sale-addition.js";
import { isSaleAdditionRefusal, saleToAddTo, validPromotions } from "./sale-addition.js";
import type { IdGenerator, SaleLedger } from "./sale-ledger.js";
import { type StableWeighing, scaleWeighingStep } from "./scale-weighing-step.js";
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
  take: boolean;
}

export interface WeighProductOnScalePorts {
  ledger: SaleLedger;
  restoration: RegisterRestoration;
  clock: Clock;
  zoneRules: ZoneRulesSource;
  ids: IdGenerator;
  scale: Scale;
}

export type WeighProductOnScaleOutcome =
  | SaleAdditionRefusal
  | WeighedProductRefusal
  | { kind: "no_price"; productName: string }
  | { kind: "weighing" }
  | { kind: "zero_weight" }
  | { kind: "scale_unavailable" }
  | StableWeighing
  | AddedLineOutcome;

export async function weighProductOnScale(
  { ledger, restoration, clock, zoneRules, ids, scale }: WeighProductOnScalePorts,
  { actorId, productId, take }: WeighProductOnScaleInput,
): Promise<WeighProductOnScaleOutcome> {
  const reading = await scale.read();
  return ledger.transaction<WeighProductOnScaleOutcome>((tx) => {
    const addition = saleToAddTo(tx, actorId, clock, restoration);
    if (isSaleAdditionRefusal(addition)) {
      return addition;
    }
    const product = weighedProductToAdd(tx, productId);
    if (isWeighedProductRefusal(product)) {
      return product;
    }
    const priced = pricedWeighedProduct(tx, clock, zoneRules, product);
    if (isNoPrice(priced)) {
      return priced;
    }
    const step = scaleWeighingStep(
      reading,
      take,
      (weightThousandths) =>
        newWeighedSaleLine(
          "weighing",
          priced.product,
          priced.price,
          validPromotions(tx, priced.product.id, priced.moment, priced.rules),
          weightThousandths,
          "SCALE",
        ).lineTotal,
    );
    if (step.kind !== "take") {
      return step;
    }
    return addWeighedLine(tx, addition, ids, priced, step.weightThousandths, "SCALE");
  });
}
