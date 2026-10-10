import type { Fortnight } from "../../../fiscal/index.js";
import type { OfflineAuthorizationCodeRequests } from "../sync-ports.js";

export class FakeOfflineAuthorizationCodeRequests implements OfflineAuthorizationCodeRequests {
  heldFortnights: Fortnight[] = [];
  installationsWithOfflinePointOfSale: string[] = [];
  heldCodeQuestions: Fortnight[] = [];
  requests = 0;
  private readonly operations: string[];

  constructor(operations: string[] = []) {
    this.operations = operations;
  }

  async installedRegisterHasOfflinePointOfSale(deviceId: string): Promise<boolean> {
    this.operations.push("installedRegisterHasOfflinePointOfSale");
    return this.installationsWithOfflinePointOfSale.includes(deviceId);
  }

  async holdsOfflineAuthorizationCodeFor(fortnight: Fortnight): Promise<boolean> {
    this.operations.push("holdsOfflineAuthorizationCodeFor");
    this.heldCodeQuestions.push(fortnight);
    return this.heldFortnights.some((held) => held.start === fortnight.start);
  }

  async requestOfflineAuthorizationCode(): Promise<void> {
    this.operations.push("requestOfflineAuthorizationCode");
    this.requests += 1;
  }
}
