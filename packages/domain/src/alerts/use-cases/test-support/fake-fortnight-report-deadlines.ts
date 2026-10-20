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
  private readonly openOverdueScopes: Set<string>;
  private readonly closedOverdueScopes: Set<string>;

  constructor({
    pendingScopes = [],
    openOverdueScopes = [],
    closedOverdueScopes = [],
  }: {
    pendingScopes?: readonly string[];
    openOverdueScopes?: readonly string[];
    closedOverdueScopes?: readonly string[];
  } = {}) {
    this.pendingScopes = new Set(pendingScopes);
    this.openOverdueScopes = new Set(openOverdueScopes);
    this.closedOverdueScopes = new Set(closedOverdueScopes);
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
    return this.openOverdueScopes.has(scope) || this.closedOverdueScopes.has(scope);
  }

  async hasOpenOverdueAlert(scope: string): Promise<boolean> {
    return this.openOverdueScopes.has(scope);
  }

  async openOverdueAlert(alert: OpenAlertInput): Promise<void> {
    this.overdueAlerts.push(structuredClone(alert));
    this.openOverdueScopes.add(alert.scope);
  }
}
