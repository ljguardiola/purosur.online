import { argentinaCalendarDay } from "../../shared/index.js";
import {
  closedMonthsWindow,
  isExceptionShareBreach,
  isMonthClosed,
} from "../model/exception-share.js";
import type {
  ExceptionShareMonth,
  RecordExceptionShareBreachesPorts,
} from "./record-exception-share-breaches-ports.js";

export type RecordExceptionShareBreachesOutcome = {
  kind: "recorded";
  recorded: number;
  updated: number;
};

function keyOf({ fiscalAddressId, month }: ExceptionShareMonth): string {
  return JSON.stringify([fiscalAddressId, month]);
}

export async function recordExceptionShareBreaches({
  store,
  clock,
  zoneRules,
}: RecordExceptionShareBreachesPorts): Promise<RecordExceptionShareBreachesOutcome> {
  const today = argentinaCalendarDay(clock.now(), zoneRules.zoneRules());
  const window = closedMonthsWindow(today);
  return store.transaction(async (transaction) => {
    const figures = await transaction.lockMonthlyVoucherCounts(window);
    const recorded = new Map(
      (await transaction.recordedBreaches(window)).map((each) => [keyOf(each), each]),
    );
    let recordedCount = 0;
    let updatedCount = 0;
    for (const month of figures.filter((each) => isMonthClosed(each.month, today))) {
      const known = recorded.get(keyOf(month));
      if (known === undefined) {
        if (isExceptionShareBreach(month)) {
          await transaction.recordBreach(month);
          recordedCount += 1;
        }
      } else if (
        known.exceptionCount !== month.exceptionCount ||
        known.totalCount !== month.totalCount
      ) {
        await transaction.updateRecordedBreach(month);
        updatedCount += 1;
      }
    }
    return { kind: "recorded", recorded: recordedCount, updated: updatedCount };
  });
}
