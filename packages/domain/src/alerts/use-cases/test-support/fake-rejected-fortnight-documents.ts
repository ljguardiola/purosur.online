import type { AlertConditionObservation } from "../../model/alert-condition-observation.js";
import type {
  RejectedFortnightDocument,
  RejectedFortnightDocumentAlerts,
  RejectedFortnightDocumentReader,
} from "../rejected-fortnight-document-ports.js";

export class FakeRejectedFortnightDocumentReader implements RejectedFortnightDocumentReader {
  private readonly rejected: readonly RejectedFortnightDocument[];

  constructor(rejected: readonly RejectedFortnightDocument[]) {
    this.rejected = structuredClone(rejected);
  }

  async presentationsAwaitingRemedy(): Promise<RejectedFortnightDocument[]> {
    return structuredClone([...this.rejected]);
  }
}

export class FakeRejectedFortnightDocumentAlerts implements RejectedFortnightDocumentAlerts {
  readonly observations: AlertConditionObservation[] = [];
  private readonly scopes: Set<string>;

  constructor(scopes: readonly string[] = []) {
    this.scopes = new Set(scopes);
  }

  async rejectedDocumentAlertScopes(): Promise<string[]> {
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
