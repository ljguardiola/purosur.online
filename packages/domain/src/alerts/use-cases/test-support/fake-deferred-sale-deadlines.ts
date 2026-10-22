import type { AlertConditionObservation } from "../../model/alert-condition-observation.js";
import type {
  DeferredSaleDeadlineAlerts,
  DeferredSaleDeadlineReader,
  PendingDeferredSaleForAlert,
} from "../deferred-sale-deadline-ports.js";

export class FakeDeferredSaleDeadlineReader implements DeferredSaleDeadlineReader {
  private readonly pending: readonly PendingDeferredSaleForAlert[];

  constructor(pending: readonly PendingDeferredSaleForAlert[]) {
    this.pending = structuredClone(pending);
  }

  async pendingDeferredSales(): Promise<PendingDeferredSaleForAlert[]> {
    return structuredClone([...this.pending]);
  }
}

export class FakeDeferredSaleDeadlineAlerts implements DeferredSaleDeadlineAlerts {
  readonly observations: AlertConditionObservation[] = [];
  private readonly openScopes: Set<string>;

  constructor(openScopes: readonly string[] = []) {
    this.openScopes = new Set(openScopes);
  }

  async dueAlertScopes(): Promise<string[]> {
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
