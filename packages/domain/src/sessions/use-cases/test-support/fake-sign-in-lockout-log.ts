import type { SignInLockoutLog, TrippedLockout } from "../sign-in-lockout-log.js";

export class FakeSignInLockoutLog implements SignInLockoutLog {
  readonly recorded: TrippedLockout[] = [];

  async recordLockout(lockout: TrippedLockout): Promise<void> {
    this.recorded.push(structuredClone(lockout));
  }
}
