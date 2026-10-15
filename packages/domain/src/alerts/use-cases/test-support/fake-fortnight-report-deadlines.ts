import type { AlertConditionObservation } from "../../model/alert-condition-observation.js";
import type { OpenAlertInput } from "../../model/alert-details.js";
import type {
  FortnightReportDeadlineAlerts,
  OwedFortnightPresentation,
  OwedFortnightPresentationReader,
} from "../fortnight-report-deadline-ports.js";

export class FakeOwedFortnightPresentationReader implements OwedFortnightPresentationReader {
  readonly requestedDays: string[] = [];
  private readonly owed: readonly OwedFortnightPresentation[];

  constructor(owed: readonly OwedFortnightPresentation[]) {
    this.owed = structuredClone(owed);
  }

  async owedPresentations(today: string): Promise<OwedFortnightPresentation[]> {
    this.requestedDays.push(today);
    return structuredClone([...this.owed]);
  }
}

export class FakeFortnightReportDeadlineAlerts implements FortnightReportDeadlineAlerts {
  readonly observations: AlertConditionObservation[] = [];
  readonly overdueAlerts: OpenAlertInput[] = [];
  private readonly pendingScopes: Set<string>;
  private readonly overdueScopes: Set<string>;

  constructor({
    pendingScopes = [],
    overdueScopes = [],
  }: { pendingScopes?: readonly string[]; overdueScopes?: readonly string[] } = {}) {
    this.pendingScopes = new Set(pendingScopes);
    this.overdueScopes = new Set(overdueScopes);
  }

  async pendingAlertScopes(): Promise<string[]> {
    return [...this.pendingScopes];
  }

  async observeAlertCondition(observation: AlertConditionObservation): Promise<void> {
    this.observations.push(structuredClone(observation));
    if (observation.holds) {
      this.pendingScopes.add(observation.alert.scope);
    }
  }

  async hasOpenedOverdueAlert(scope: string): Promise<boolean> {
    return this.overdueScopes.has(scope);
  }

  async openOverdueAlert(alert: OpenAlertInput): Promise<void> {
    this.overdueAlerts.push(structuredClone(alert));
    this.overdueScopes.add(alert.scope);
  }
}
