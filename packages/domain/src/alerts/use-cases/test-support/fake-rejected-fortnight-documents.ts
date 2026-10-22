import type { AlertConditionObservation } from "../../model/alert-condition-observation.js";
import type {
  RejectedFortnightDocumentAlerts,
  RejectedFortnightDocumentCandidate,
  RejectedFortnightDocumentCandidateReader,
} from "../rejected-fortnight-document-ports.js";

export class FakeRejectedFortnightDocumentReader
  implements RejectedFortnightDocumentCandidateReader
{
  private readonly rejected: readonly RejectedFortnightDocumentCandidate[];

  constructor(rejected: readonly RejectedFortnightDocumentCandidate[]) {
    this.rejected = structuredClone(rejected);
  }

  async presentationsAwaitingRemedy(): Promise<RejectedFortnightDocumentCandidate[]> {
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
