import type { Clock, ZoneRulesSource } from "../../shared/index.js";
import type { ExceptionShareCounts } from "../model/exception-share.js";

export interface ExceptionShareFiscalAddress {
  id: string;
  name: string;
}

export interface ExceptionShareYearQuery {
  fiscalAddressId: string;
  year: number;
}

export interface MonthlyVoucherCounts extends ExceptionShareCounts {
  month: string;
}

export interface ExceptionShareYearReader {
  fiscalAddress(fiscalAddressId: string): Promise<ExceptionShareFiscalAddress | undefined>;
  monthlyVoucherCounts(query: ExceptionShareYearQuery): Promise<MonthlyVoucherCounts[]>;
  recordedBreachMonths(query: ExceptionShareYearQuery): Promise<string[]>;
}

export interface ReadExceptionShareYearPorts {
  reader: ExceptionShareYearReader;
  clock: Clock;
  zoneRules: ZoneRulesSource;
}
