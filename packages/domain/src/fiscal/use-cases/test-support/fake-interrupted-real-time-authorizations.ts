import type {
  InterruptedRealTimeAuthorization,
  InterruptedRealTimeAuthorizations,
  InterruptedRealTimeAuthorizationsTransaction,
} from "../interrupted-real-time-authorization-ports.js";
import type { RealTimeAuthorizationResolved } from "../real-time-authorization-ports.js";

export class FakeInterruptedRealTimeAuthorizations implements InterruptedRealTimeAuthorizations {
  resolutions: readonly RealTimeAuthorizationResolved[] = [];
  failOnDocument: string | undefined;
  private readonly requesting: readonly InterruptedRealTimeAuthorization[];

  constructor(requesting: readonly InterruptedRealTimeAuthorization[]) {
    this.requesting = requesting;
  }

  transaction<TOutcome>(
    work: (tx: InterruptedRealTimeAuthorizationsTransaction) => TOutcome,
  ): TOutcome {
    const working = [...this.resolutions];
    const outcome = work({
      requestingDocuments: () => this.requesting,
      resolve: (resolved) => {
        this.failIfAsked(resolved);
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
