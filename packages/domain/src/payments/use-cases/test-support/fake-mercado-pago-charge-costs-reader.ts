import type { ReportPeriod } from "../../../shared/index.js";
import type {
  MercadoPagoChargeCostsReader,
  RecordedMercadoPagoCharge,
} from "../mercado-pago-charge-costs-reader.js";

export class FakeMercadoPagoChargeCostsReader implements MercadoPagoChargeCostsReader {
  readonly chargeReads: { locationId: string; period: ReportPeriod }[] = [];
  private readonly charges: RecordedMercadoPagoCharge[];

  constructor(charges: RecordedMercadoPagoCharge[] = []) {
    this.charges = charges;
  }

  async chargesOfPeriod(query: {
    locationId: string;
    period: ReportPeriod;
  }): Promise<RecordedMercadoPagoCharge[]> {
    this.chargeReads.push({ ...query, period: { ...query.period } });
    return [...this.charges];
  }
}
