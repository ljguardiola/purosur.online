import type { ReportPeriod } from "../../../shared/index.js";
import type {
  MercadoPagoChargeCostsReader,
  OtherMercadoPagoCharge,
  RecordedMercadoPagoCharge,
} from "../mercado-pago-charge-costs-reader.js";

export class FakeMercadoPagoChargeCostsReader implements MercadoPagoChargeCostsReader {
  readonly chargeReads: { locationId: string; period: ReportPeriod }[] = [];
  readonly otherChargeReads: { period: ReportPeriod }[] = [];
  private readonly charges: RecordedMercadoPagoCharge[];
  private readonly otherCharges: OtherMercadoPagoCharge[];

  constructor(
    charges: RecordedMercadoPagoCharge[] = [],
    otherCharges: OtherMercadoPagoCharge[] = [],
  ) {
    this.charges = charges;
    this.otherCharges = otherCharges;
  }

  async chargesOfPeriod(query: {
    locationId: string;
    period: ReportPeriod;
  }): Promise<RecordedMercadoPagoCharge[]> {
    this.chargeReads.push({ ...query, period: { ...query.period } });
    return [...this.charges];
  }

  async otherChargesOfPeriod(query: { period: ReportPeriod }): Promise<OtherMercadoPagoCharge[]> {
    this.otherChargeReads.push({ period: { ...query.period } });
    return [...this.otherCharges];
  }
}
