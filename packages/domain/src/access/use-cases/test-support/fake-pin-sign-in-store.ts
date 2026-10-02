import type {
  PinCheckPorts,
  PinHolder,
  PinMatcher,
  PinMatching,
  PinSignInFailures,
  PinSignInStore,
} from "../pin-sign-in-store.js";
import { FixedClock } from "./fake-pin-code-store.js";

class FakePinSignInStore implements PinSignInStore<string> {
  readonly holders = new Map<string, PinHolder<string>>();
  readonly failures = new Map<string, PinSignInFailures>();

  seedHolder(userId: string, holder: PinHolder<string>): void {
    this.holders.set(userId, holder);
  }

  seedFailures(userId: string, failures: PinSignInFailures): void {
    this.failures.set(userId, failures);
  }

  pinHolder(userId: string): PinHolder<string> | undefined {
    return this.holders.get(userId);
  }

  pinSignInFailures(userId: string): PinSignInFailures | undefined {
    return this.failures.get(userId);
  }

  recordPinSignInFailure(userId: string, at: Date): PinSignInFailures {
    const recorded = {
      consecutiveFailures: (this.failures.get(userId)?.consecutiveFailures ?? 0) + 1,
      lastFailedAt: at,
    };
    this.failures.set(userId, recorded);
    return recorded;
  }

  withdrawPinSignInFailure(userId: string): void {
    const current = this.failures.get(userId);
    if (current === undefined) {
      return;
    }
    if (current.consecutiveFailures <= 1) {
      this.failures.delete(userId);
      return;
    }
    this.failures.set(userId, {
      ...current,
      consecutiveFailures: current.consecutiveFailures - 1,
    });
  }

  clearPinSignInFailures(userId: string): void {
    this.failures.delete(userId);
  }
}

class FakePinMatching implements PinMatching<string> {
  unavailable = false;
  failure: Error | undefined;
  readonly matched: { pin: string; credential: string }[] = [];
  private pending: { release: () => void; promise: Promise<void> } | undefined;

  hold(): void {
    let release = () => {};
    const promise = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.pending = { release, promise };
  }

  release(): void {
    this.pending?.release();
    this.pending = undefined;
  }

  async matcher(): Promise<PinMatcher<string> | undefined> {
    if (this.unavailable) {
      return undefined;
    }
    return {
      matches: async (pin, credential) => {
        this.matched.push({ pin, credential });
        await this.pending?.promise;
        if (this.failure !== undefined) {
          throw this.failure;
        }
        return pin === credential;
      },
    };
  }
}

export interface PinCheckFixture {
  store: FakePinSignInStore;
  matching: FakePinMatching;
  ports: PinCheckPorts<string>;
}

export function pinCheckFixture(now: Date): PinCheckFixture {
  const store = new FakePinSignInStore();
  const matching = new FakePinMatching();
  return { store, matching, ports: { store, matching, clock: new FixedClock(now) } };
}
