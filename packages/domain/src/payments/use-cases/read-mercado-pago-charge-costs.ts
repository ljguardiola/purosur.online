import {
  type Clock,
  type ReportPeriod,
  reportPeriodOf,
  type ZoneRulesSource,
} from "../../shared/index.js";
import {
  type ChargeCostsSummary,
  summarizeChargeCosts,
} from "../model/mercado-pago-charge-costs.js";
import type { MercadoPagoChargeCostsReader } from "./mercado-pago-charge-costs-reader.js";

export interface ReadMercadoPagoChargeCostsInput {
  locationId: string;
  asked: { from: string | undefined; to: string | undefined };
}

export type MercadoPagoChargeCostsReport = ChargeCostsSummary & {
  range: ReportPeriod;
};

export async function readMercadoPagoChargeCosts(
  {
    reader,
    clock,
    zoneRules,
  }: { reader: MercadoPagoChargeCostsReader; clock: Clock; zoneRules: ZoneRulesSource },
  { locationId, asked }: ReadMercadoPagoChargeCostsInput,
): Promise<MercadoPagoChargeCostsReport> {
  const rules = zoneRules.zoneRules();
  const range = reportPeriodOf(asked, clock.now(), rules);
  const [charges, otherCharges] = await Promise.all([
    reader.chargesOfPeriod({ locationId, period: range }),
    reader.otherChargesOfPeriod({ period: range }),
  ]);
  return { range, ...summarizeChargeCosts({ charges, otherCharges, period: range, rules }) };
}
