import type { ListedOwedPresentation } from "../../../fiscal/index.js";
import type { AlertConditionObservation } from "../../model/alert-condition-observation.js";
import type {
  OwedElsewhereAlerts,
  OwedElsewherePresentationReader,
} from "../owed-elsewhere-presentation-ports.js";

export class FakeOwedElsewherePresentationReader implements OwedElsewherePresentationReader {
  private readonly owed: readonly ListedOwedPresentation[];

  constructor(owed: readonly ListedOwedPresentation[]) {
    this.owed = structuredClone(owed);
  }

  async owedElsewhere(): Promise<ListedOwedPresentation[]> {
    return structuredClone([...this.owed]);
  }
}

export class FakeOwedElsewhereAlerts implements OwedElsewhereAlerts {
  readonly observations: AlertConditionObservation[] = [];
  private readonly scopes: Set<string>;

  constructor(scopes: readonly string[] = []) {
    this.scopes = new Set(scopes);
  }

  async owedElsewhereAlertScopes(): Promise<string[]> {
    return [...this.scopes];
  }

  async observeAlertCondition(observation: AlertConditionObservation): Promise<void> {
    this.observations.push(structuredClone(observation));
    if (observation.holds) {
      this.scopes.add(observation.alert.scope);
    } else {
      this.scopes.delete(observation.scope);
    }
  }
}
