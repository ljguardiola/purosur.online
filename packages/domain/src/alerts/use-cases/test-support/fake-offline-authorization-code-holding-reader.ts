import type {
  Fortnight,
  OfflineAuthorizationCodeHoldingReader,
  RegisterOfflineAuthorizationCodeHolding,
} from "../../../fiscal/index.js";

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
