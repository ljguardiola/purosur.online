import type { Fortnight } from "../../../fiscal/index.js";
import type {
  OfflineAuthorizationCodeHoldingReader,
  RegisterOfflineAuthorizationCodeHolding,
} from "../offline-authorization-code-holding-reader.js";
import type { FakeAlertStore } from "./fake-alert-store.js";

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
  private readonly store: FakeAlertStore;

  constructor(watched: readonly FakeWatchedHolding[], store: FakeAlertStore) {
    this.watched = structuredClone(watched);
    this.store = store;
  }

  async watchedRegisterHoldings(
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

  async scopesOfOpenMissingCodeAlerts(): Promise<string[]> {
    return this.store
      .snapshot()
      .alerts.filter(
        (alert) => alert.kind === "offline_authorization_code_missing" && alert.resolvedAt === null,
      )
      .map(({ scope }) => scope);
  }
}
