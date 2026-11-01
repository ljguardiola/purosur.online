import type {
  ClosedMonthsWindow,
  ExceptionShareBreachStore,
  ExceptionShareBreachTransaction,
  ExceptionShareMonth,
} from "../record-exception-share-breaches-ports.js";

interface BreachState {
  recorded: ExceptionShareMonth[];
}

function sameMonth(a: ExceptionShareMonth, b: ExceptionShareMonth): boolean {
  return a.fiscalAddressId === b.fiscalAddressId && a.month === b.month;
}

export class FakeExceptionShareBreachStore implements ExceptionShareBreachStore {
  readonly windows: ClosedMonthsWindow[] = [];
  transactions = 0;
  failOnUpdating = false;
  private state: BreachState;
  private readonly counts: readonly ExceptionShareMonth[];

  constructor(
    counts: readonly ExceptionShareMonth[],
    recorded: readonly ExceptionShareMonth[] = [],
  ) {
    this.counts = structuredClone([...counts]);
    this.state = { recorded: structuredClone([...recorded]) };
  }

  get recorded(): ExceptionShareMonth[] {
    return structuredClone(this.state.recorded);
  }

  async transaction<TOutcome>(
    work: (transaction: ExceptionShareBreachTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    this.transactions += 1;
    const staged = structuredClone(this.state);
    const outcome = await work({
      lockMonthlyVoucherCounts: async (window) => {
        this.windows.push({ ...window });
        return structuredClone([...this.counts]);
      },
      recordedBreaches: async () => structuredClone(staged.recorded),
      recordBreach: async (breach) => {
        staged.recorded.push(structuredClone(breach));
      },
      updateRecordedBreach: async (breach) => {
        if (this.failOnUpdating) {
          throw new Error("storage failure");
        }
        staged.recorded = staged.recorded.map((each) =>
          sameMonth(each, breach) ? structuredClone(breach) : each,
        );
      },
    });
    this.state = staged;
    return outcome;
  }
}
