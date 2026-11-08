import type { ReportPeriod } from "../../shared/index.js";
import type { OtherChargeInput, OwnChargeInput } from "../model/mercado-pago-charge-costs.js";

export type RecordedMercadoPagoCharge = OwnChargeInput;

export type OtherMercadoPagoCharge = OtherChargeInput;

export interface MercadoPagoChargeCostsReader {
  chargesOfPeriod(query: {
    locationId: string;
    period: ReportPeriod;
  }): Promise<RecordedMercadoPagoCharge[]>;
  otherChargesOfPeriod(query: { period: ReportPeriod }): Promise<OtherMercadoPagoCharge[]>;
}
