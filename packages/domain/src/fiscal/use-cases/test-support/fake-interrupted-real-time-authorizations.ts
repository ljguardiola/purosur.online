import type {
  InterruptedRealTimeAuthorization,
  InterruptedRealTimeAuthorizations,
} from "../interrupted-real-time-authorization-ports.js";
import type { RealTimeAuthorizationResolved } from "../real-time-authorization-ports.js";

export class FakeInterruptedRealTimeAuthorizations implements InterruptedRealTimeAuthorizations {
  readonly resolutions: RealTimeAuthorizationResolved[] = [];
  private readonly requesting: readonly InterruptedRealTimeAuthorization[];

  constructor(requesting: readonly InterruptedRealTimeAuthorization[]) {
    this.requesting = requesting;
  }

  async requestingDocuments(): Promise<readonly InterruptedRealTimeAuthorization[]> {
    return this.requesting;
  }

  async resolve(resolved: RealTimeAuthorizationResolved): Promise<void> {
    this.resolutions.push(resolved);
  }
}
