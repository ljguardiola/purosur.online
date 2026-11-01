import type { ExceptionShareCounts, RecordedExceptionShareBreach } from "../../../fiscal/index.js";
import type { AlertConditionObservation } from "../../model/alert-condition-observation.js";
import type {
  RunningExceptionShareCounts,
  SecondMonthRiskAlerts,
  SecondMonthRiskReader,
} from "../second-month-risk-ports.js";

interface MonthCounts extends ExceptionShareCounts {
  fiscalAddressId: string;
  month: string;
}

export class FakeSecondMonthRiskReader implements SecondMonthRiskReader {
  constructor(
    private readonly breaches: readonly RecordedExceptionShareBreach[],
    private readonly counts: readonly MonthCounts[] = [],
  ) {}

  async addressesWithRecordedBreach(month: string) {
    return this.breaches
      .filter((breach) => breach.month === month)
      .map(({ fiscalAddressId, fiscalAddressName }) => ({ fiscalAddressId, fiscalAddressName }));
  }

  async runningCounts(month: string): Promise<RunningExceptionShareCounts[]> {
    return this.counts
      .filter((each) => each.month === month)
      .map(({ fiscalAddressId, exceptionCount, totalCount }) => ({
        fiscalAddressId,
        exceptionCount,
        totalCount,
      }));
  }
}

export class FakeSecondMonthRiskAlerts implements SecondMonthRiskAlerts {
  readonly observations: AlertConditionObservation[] = [];
  private readonly openScopes: Set<string>;

  constructor(openScopes: readonly string[] = []) {
    this.openScopes = new Set(openScopes);
  }

  async atRiskAlertScopes(): Promise<string[]> {
    return [...this.openScopes];
  }

  async observeAlertCondition(observation: AlertConditionObservation): Promise<void> {
    this.observations.push(structuredClone(observation));
    if (observation.holds) {
      this.openScopes.add(observation.alert.scope);
    } else {
      this.openScopes.delete(observation.scope);
    }
  }
}
