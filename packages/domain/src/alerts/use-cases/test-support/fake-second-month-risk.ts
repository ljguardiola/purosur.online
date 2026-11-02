import type {
  ArcaAvailabilityRun,
  ContingencyPart,
  ContingencyReportingRegister,
  ExceptionShareCounts,
  RecordedExceptionShareBreach,
} from "../../../fiscal/index.js";
import type { AlertConditionObservation } from "../../model/alert-condition-observation.js";
import type {
  RunningExceptionShareCounts,
  SecondMonthRiskAddress,
  SecondMonthRiskAlerts,
  SecondMonthRiskReader,
} from "../second-month-risk-ports.js";

interface MonthCounts extends ExceptionShareCounts {
  fiscalAddressId: string;
  month: string;
}

interface FakeSecondMonthRiskData {
  breaches?: readonly RecordedExceptionShareBreach[];
  counts?: readonly MonthCounts[];
  addresses?: readonly SecondMonthRiskAddress[];
  runs?: readonly ArcaAvailabilityRun[];
  contingency?: ReadonlyMap<string, ContingencyIntervalsOfAddress>;
}

interface ContingencyIntervalsOfAddress {
  parts: ContingencyPart[];
  registers: ContingencyReportingRegister[];
}

export class FakeSecondMonthRiskReader implements SecondMonthRiskReader {
  readonly availabilityWindows: { from: Date; to: Date }[] = [];
  private readonly breaches: readonly RecordedExceptionShareBreach[];
  private readonly counts: readonly MonthCounts[];
  private readonly addresses: readonly SecondMonthRiskAddress[];
  private readonly runs: readonly ArcaAvailabilityRun[];
  private readonly contingency: ReadonlyMap<string, ContingencyIntervalsOfAddress>;

  constructor({
    breaches = [],
    counts = [],
    addresses,
    runs = [],
    contingency = new Map(),
  }: FakeSecondMonthRiskData = {}) {
    this.breaches = breaches;
    this.counts = counts;
    this.addresses =
      addresses ??
      [...new Set(breaches.map((breach) => breach.fiscalAddressId))].map((fiscalAddressId) => ({
        fiscalAddressId,
        fiscalAddressName: `Address ${fiscalAddressId}`,
      }));
    this.runs = runs;
    this.contingency = contingency;
  }

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

  async fiscalAddresses(): Promise<SecondMonthRiskAddress[]> {
    return [...this.addresses];
  }

  async availabilityRuns(window: { from: Date; to: Date }): Promise<ArcaAvailabilityRun[]> {
    this.availabilityWindows.push(window);
    return [...this.runs];
  }

  async contingencyIntervalsAtFiscalAddress({
    fiscalAddressId,
  }: {
    fiscalAddressId: string;
    from: Date;
    to: Date;
  }): Promise<ContingencyIntervalsOfAddress> {
    return this.contingency.get(fiscalAddressId) ?? { parts: [], registers: [] };
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
