import { ShortCodeTaken } from "../deferred-sale-ports.js";
import type {
  InterruptedRealTimeAuthorization,
  InterruptedRealTimeAuthorizations,
  InterruptedRealTimeAuthorizationsTransaction,
} from "../interrupted-real-time-authorization-ports.js";
import type { RealTimeAuthorizationResolved } from "../real-time-authorization-ports.js";

export class FakeInterruptedRealTimeAuthorizations implements InterruptedRealTimeAuthorizations {
  resolutions: readonly RealTimeAuthorizationResolved[] = [];
  readonly resolutionAttempts: RealTimeAuthorizationResolved[] = [];
  failOnDocument: string | undefined;
  private readonly requesting: readonly InterruptedRealTimeAuthorization[];
  private readonly takenShortCodes: readonly string[];

  constructor(
    requesting: readonly InterruptedRealTimeAuthorization[],
    takenShortCodes: readonly string[] = [],
  ) {
    this.requesting = requesting;
    this.takenShortCodes = takenShortCodes;
  }

  transaction<TOutcome>(
    work: (tx: InterruptedRealTimeAuthorizationsTransaction) => TOutcome,
  ): TOutcome {
    const working = [...this.resolutions];
    const outcome = work({
      requestingDocuments: () => this.requesting,
      resolve: (resolved) => {
        this.failIfAsked(resolved);
        this.resolutionAttempts.push(resolved);
        if (
          resolved.deferredSale !== null &&
          this.takenShortCodes.includes(resolved.deferredSale.sale.shortCode)
        ) {
          throw new ShortCodeTaken();
        }
        working.push(resolved);
      },
    });
    this.resolutions = working;
    return outcome;
  }

  private failIfAsked({ fiscalDocumentId }: RealTimeAuthorizationResolved): void {
    if (fiscalDocumentId === this.failOnDocument) {
      throw new Error(`resolving ${fiscalDocumentId} failed`);
    }
  }
}
