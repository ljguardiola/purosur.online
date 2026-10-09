import type { PinReplacementPorts, PinReplacementStore } from "../replace-pin.js";

class FakePinReplacementStore implements PinReplacementStore<string> {
  readonly credentials = new Map<string, string>();
  readonly failureCounts = new Map<string, number>();

  seedCredential(userId: string, credential: string): void {
    this.credentials.set(userId, credential);
  }

  seedFailures(userId: string, consecutiveFailures: number): void {
    this.failureCounts.set(userId, consecutiveFailures);
  }

  savePinCredential(userId: string, credential: string | undefined): boolean {
    const previous = this.credentials.get(userId);
    if (credential === undefined) {
      this.credentials.delete(userId);
    } else {
      this.credentials.set(userId, credential);
    }
    return previous !== credential;
  }

  clearPinSignInFailures(userId: string): void {
    this.failureCounts.delete(userId);
  }
}

export interface PinReplacementFixture {
  store: FakePinReplacementStore;
  ports: PinReplacementPorts<string>;
}

export function pinReplacementFixture(): PinReplacementFixture {
  const store = new FakePinReplacementStore();
  return { store, ports: { store } };
}
