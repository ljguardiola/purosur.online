import type { Clock, ZoneRulesSource } from "../../shared/index.js";
import type { ClosedMonthsWindow, ExceptionShareCounts } from "../model/exception-share.js";

export interface ExceptionShareMonth extends ExceptionShareCounts {
  fiscalAddressId: string;
  month: string;
}

export interface ExceptionShareBreachTransaction {
  lockMonthlyVoucherCounts(window: ClosedMonthsWindow): Promise<ExceptionShareMonth[]>;
  recordedBreaches(window: ClosedMonthsWindow): Promise<ExceptionShareMonth[]>;
  recordBreach(breach: ExceptionShareMonth): Promise<void>;
  updateRecordedBreach(breach: ExceptionShareMonth): Promise<void>;
}

export interface ExceptionShareBreachStore {
  transaction<TOutcome>(
    work: (transaction: ExceptionShareBreachTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}

export interface RecordExceptionShareBreachesPorts {
  store: ExceptionShareBreachStore;
  clock: Clock;
  zoneRules: ZoneRulesSource;
}
