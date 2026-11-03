import type { Clock, Scale, ZoneRulesSource } from "../../shared/index.js";
import { withWeight } from "../model/sale-line.js";
import {
  type ChangeLineWeightOutcome,
  changeWeightOfLine,
  weighedLineToChange,
} from "./change-line-weight.js";
import type { RegisterRestoration } from "./register-restoration.js";
import type { SaleLedger } from "./sale-ledger.js";
import { isSaleLineChangeRefusal, saleToChange } from "./sale-line-change.js";
import { type StableWeighing, scaleWeighingStep } from "./scale-weighing-step.js";

export interface WeighLineOnScaleInput {
  actorId: string;
  lineId: string;
  expectedWeightThousandths: number;
  take: boolean;
}

export interface WeighLineOnScalePorts {
  ledger: SaleLedger;
  restoration: RegisterRestoration;
  clock: Clock;
  zoneRules: ZoneRulesSource;
  scale: Scale;
}

export type WeighLineOnScaleOutcome =
  | Exclude<ChangeLineWeightOutcome, { kind: "invalid_weight" }>
  | { kind: "weighing" }
  | { kind: "zero_weight" }
  | { kind: "scale_unavailable" }
  | StableWeighing;

export async function weighLineOnScale(
  { ledger, restoration, clock, zoneRules, scale }: WeighLineOnScalePorts,
  { actorId, lineId, expectedWeightThousandths, take }: WeighLineOnScaleInput,
): Promise<WeighLineOnScaleOutcome> {
  const reading = await scale.read();
  return ledger.transaction<WeighLineOnScaleOutcome>((tx) => {
    const sale = saleToChange(tx, actorId, clock, restoration);
    if (isSaleLineChangeRefusal(sale)) {
      return sale;
    }
    const line = weighedLineToChange(sale, lineId, expectedWeightThousandths);
    if ("kind" in line) {
      return line;
    }
    const step = scaleWeighingStep(
      reading,
      take,
      (weightThousandths) => withWeight(line, weightThousandths, "SCALE").lineTotal,
    );
    if (step.kind !== "take") {
      return step;
    }
    return changeWeightOfLine(
      tx,
      { sale, line },
      step.weightThousandths,
      "SCALE",
      clock,
      zoneRules,
    );
  });
}
