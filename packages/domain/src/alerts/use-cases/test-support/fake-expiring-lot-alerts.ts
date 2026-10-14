import type { AlertConditionObservation } from "../../model/alert-condition-observation.js";
import type {
  BranchExpiringLotReader,
  BranchExpiryWindow,
  BranchExpiryWindowReader,
  ExpiringLotAlerts,
  ExpiringLotCandidate,
} from "../expiring-lot-alert-ports.js";

export class FakeBranchExpiryWindowReader implements BranchExpiryWindowReader {
  private readonly windows: readonly BranchExpiryWindow[];

  constructor(windows: readonly BranchExpiryWindow[]) {
    this.windows = structuredClone(windows);
  }

  async branchExpiryWindows(): Promise<BranchExpiryWindow[]> {
    return structuredClone([...this.windows]);
  }
}

export class FakeBranchExpiringLotReader implements BranchExpiringLotReader {
  readonly reads: { locationId: string; lastDay: string }[] = [];
  private readonly lots: readonly (ExpiringLotCandidate & { locationId: string })[];

  constructor(lots: readonly (ExpiringLotCandidate & { locationId: string })[]) {
    this.lots = structuredClone(lots);
  }

  async lotsExpiringBy(locationId: string, lastDay: string): Promise<ExpiringLotCandidate[]> {
    this.reads.push({ locationId, lastDay });
    return this.lots
      .filter(
        (lot) =>
          lot.locationId === locationId && (lot.expiresOn === null || lot.expiresOn <= lastDay),
      )
      .map(({ locationId: _, ...lot }) => lot);
  }
}

export class FakeExpiringLotAlerts implements ExpiringLotAlerts {
  readonly observations: AlertConditionObservation[] = [];
  private readonly openScopes: Set<string>;

  constructor(openScopes: readonly string[] = []) {
    this.openScopes = new Set(openScopes);
  }

  async openAlertScopes(): Promise<string[]> {
    return [...this.openScopes];
  }

  async observeAlertCondition(observation: AlertConditionObservation): Promise<void> {
    this.observations.push(structuredClone(observation));
    if (observation.holds) {
      this.openScopes.add(observation.alert.scope);
    }
  }
}
