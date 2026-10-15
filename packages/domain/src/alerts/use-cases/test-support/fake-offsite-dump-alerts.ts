import type { OffsiteDumpCheckResult } from "../../../backups/index.js";
import type { AlertConditionObservation } from "../../model/alert-condition-observation.js";
import type {
  OffsiteDumpAlerts,
  OffsiteDumpCheckReader,
} from "../unverified-offsite-dump-ports.js";

export class FakeOffsiteDumpCheckReader implements OffsiteDumpCheckReader {
  readonly reads: string[] = [];
  private readonly results: Readonly<Record<string, OffsiteDumpCheckResult>>;

  constructor(results: Readonly<Record<string, OffsiteDumpCheckResult>> = {}) {
    this.results = structuredClone(results);
  }

  async offsiteDumpCheckOf(night: string): Promise<OffsiteDumpCheckResult | undefined> {
    this.reads.push(night);
    return structuredClone(this.results[night]);
  }
}

export class FakeOffsiteDumpAlerts implements OffsiteDumpAlerts {
  readonly observations: AlertConditionObservation[] = [];

  async observeAlertCondition(observation: AlertConditionObservation): Promise<void> {
    this.observations.push(structuredClone(observation));
  }
}
