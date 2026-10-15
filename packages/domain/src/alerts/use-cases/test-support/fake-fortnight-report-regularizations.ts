import type { OpenAlertInput } from "../../model/alert-details.js";
import type {
  FortnightRegularizationCandidate,
  FortnightRegularizationCandidateReader,
  FortnightReportRegularizationAlerts,
} from "../fortnight-report-regularization-ports.js";

export class FakeFortnightRegularizationCandidateReader
  implements FortnightRegularizationCandidateReader
{
  private readonly presentations: readonly FortnightRegularizationCandidate[];

  constructor(presentations: readonly FortnightRegularizationCandidate[]) {
    this.presentations = structuredClone(presentations);
  }

  async presentationsNeedingRegularization(): Promise<FortnightRegularizationCandidate[]> {
    return structuredClone([...this.presentations]);
  }
}

export class FakeFortnightReportRegularizationAlerts
  implements FortnightReportRegularizationAlerts
{
  readonly openedAlerts: OpenAlertInput[] = [];
  private readonly openedScopes: Set<string>;

  constructor({ openedScopes = [] }: { openedScopes?: readonly string[] } = {}) {
    this.openedScopes = new Set(openedScopes);
  }

  async hasOpenedRegularizationAlert(scope: string): Promise<boolean> {
    return this.openedScopes.has(scope);
  }

  async openRegularizationAlert(alert: OpenAlertInput): Promise<void> {
    this.openedAlerts.push(structuredClone(alert));
    this.openedScopes.add(alert.scope);
  }
}
