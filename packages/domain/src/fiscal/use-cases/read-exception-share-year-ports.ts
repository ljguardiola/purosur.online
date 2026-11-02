import type { Clock, ZoneRulesSource } from "../../shared/index.js";
import type { ArcaAvailabilityRun } from "../model/contingency-time-share.js";
import type { ExceptionShareCounts } from "../model/exception-share.js";
import type { ContingencyIntervalsReader } from "./contingency-intervals-ports.js";

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

export interface ArcaAvailabilityQuery {
  from: Date;
  to: Date;
}

export interface ArcaAvailabilityReader {
  availabilityRuns(query: ArcaAvailabilityQuery): Promise<ArcaAvailabilityRun[]>;
}

export interface ReadExceptionShareYearPorts {
  reader: ExceptionShareYearReader;
  availability: ArcaAvailabilityReader;
  contingency: ContingencyIntervalsReader;
  clock: Clock;
  zoneRules: ZoneRulesSource;
}
