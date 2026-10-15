import type { OpenAlertInput } from "../../model/alert-details.js";
import type {
  FortnightPresentationNeedingRegularization,
  FortnightRegularizationReader,
  FortnightReportRegularizationAlerts,
} from "../fortnight-report-regularization-ports.js";

export class FakeFortnightRegularizationReader implements FortnightRegularizationReader {
  private readonly presentations: readonly FortnightPresentationNeedingRegularization[];

  constructor(presentations: readonly FortnightPresentationNeedingRegularization[]) {
    this.presentations = structuredClone(presentations);
  }

  async presentationsNeedingRegularization(): Promise<
    FortnightPresentationNeedingRegularization[]
  > {
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
