import type { ReportPeriod } from "../../shared/index.js";
import type { OwnChargeInput } from "../model/mercado-pago-charge-costs.js";

export type RecordedMercadoPagoCharge = OwnChargeInput;

export interface MercadoPagoChargeCostsReader {
  chargesOfPeriod(query: {
    locationId: string;
    period: ReportPeriod;
  }): Promise<RecordedMercadoPagoCharge[]>;
}
