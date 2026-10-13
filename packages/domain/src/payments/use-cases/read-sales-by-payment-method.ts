import { averageTicket } from "../../sales/index.js";
import { type Clock, defaultReportPeriod, type ReportPeriod } from "../../shared/index.js";
import type { PaymentsReportReader, SalesPaidByMethod } from "./payments-report-reader.js";

export interface ReadSalesByPaymentMethodInput {
  locationId: string;
  asked: { from: string | undefined; to: string | undefined };
  registerId: string | undefined;
}

export interface SalesByPaymentMethodReport {
  range: ReportPeriod;
  methods: SalesPaidByMethod[];
  totals: { salesCount: number; total: number; averageTicket: number | null };
}

export async function readSalesByPaymentMethod(
  { reader, clock }: { reader: PaymentsReportReader; clock: Clock },
  { locationId, asked, registerId }: ReadSalesByPaymentMethodInput,
): Promise<SalesByPaymentMethodReport> {
  const range =
    asked.from !== undefined && asked.to !== undefined
      ? { from: asked.from, to: asked.to }
      : defaultReportPeriod(clock.now());
  const { methods, salesCount, total } = await reader.approvedPaymentsByMethod({
    locationId,
    period: range,
    registerId,
  });
  return {
    range,
    methods,
    totals: { salesCount, total, averageTicket: averageTicket({ total, salesCount }) },
  };
}
