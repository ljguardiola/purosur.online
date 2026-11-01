import type { RecordedExceptionShareBreach } from "../../../fiscal/index.js";
import type { OpenAlertInput } from "../../model/alert-details.js";
import type {
  ExceptionShareBreachAlerts,
  RecordedExceptionShareBreachReader,
} from "../exception-share-breach-ports.js";

export class FakeRecordedExceptionShareBreachReader implements RecordedExceptionShareBreachReader {
  private readonly breaches: readonly RecordedExceptionShareBreach[];

  constructor(breaches: readonly RecordedExceptionShareBreach[]) {
    this.breaches = structuredClone(breaches);
  }

  async recordedBreaches(): Promise<RecordedExceptionShareBreach[]> {
    return structuredClone([...this.breaches]);
  }
}

export class FakeExceptionShareBreachAlerts implements ExceptionShareBreachAlerts {
  readonly opened: OpenAlertInput[] = [];
  private readonly everOpenedScopes: Set<string>;

  constructor(everOpenedScopes: readonly string[] = []) {
    this.everOpenedScopes = new Set(everOpenedScopes);
  }

  async hasOpenedBreachAlert(scope: string): Promise<boolean> {
    return this.everOpenedScopes.has(scope);
  }

  async openBreachAlert(alert: OpenAlertInput): Promise<void> {
    this.opened.push(structuredClone(alert));
    this.everOpenedScopes.add(alert.scope);
  }
}
