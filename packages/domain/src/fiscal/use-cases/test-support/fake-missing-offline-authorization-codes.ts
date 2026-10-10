import type { AlertConditionObservation } from "../../../alerts/index.js";
import type { Clock } from "../../../shared/index.js";
import type { Fortnight } from "../../model/offline-authorization-code.js";
import type {
  MissingOfflineAuthorizationCodeAlerts,
  OfflineAuthorizationCodeHoldingReader,
  RegisterOfflineAuthorizationCodeHolding,
} from "../missing-offline-authorization-code-ports.js";

export interface FakeWatchedHolding {
  registerId: string;
  deviceId: string;
  holdsCodeOf: readonly string[];
}

export class FakeOfflineAuthorizationCodeHoldingReader
  implements OfflineAuthorizationCodeHoldingReader
{
  readonly requestedFortnights: (readonly Fortnight[])[] = [];
  private readonly watched: readonly FakeWatchedHolding[];

  constructor(watched: readonly FakeWatchedHolding[]) {
    this.watched = structuredClone(watched);
  }

  async registerHoldings(
    fortnights: readonly Fortnight[],
  ): Promise<RegisterOfflineAuthorizationCodeHolding[]> {
    this.requestedFortnights.push(structuredClone(fortnights));
    return this.watched.map(({ registerId, deviceId, holdsCodeOf }) => ({
      registerId,
      deviceId,
      heldFortnightStarts: fortnights
        .map(({ start }) => start)
        .filter((start) => holdsCodeOf.includes(start)),
    }));
  }
}

export class FakeMissingOfflineAuthorizationCodeAlerts
  implements MissingOfflineAuthorizationCodeAlerts
{
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

export class FixedClock implements Clock {
  private readonly instant: Date;

  constructor(instant: Date) {
    this.instant = instant;
  }

  now(): Date {
    return new Date(this.instant);
  }
}
