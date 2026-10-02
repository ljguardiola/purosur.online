import type { PasskeySummary, Passkeys } from "../passkeys.js";

export interface FakePasskey extends PasskeySummary {
  userId: string;
}

export class FakePasskeys implements Passkeys {
  private readonly stored: FakePasskey[] = [];

  seedPasskey(passkey: FakePasskey): void {
    this.stored.push(passkey);
  }

  async passkeySummaries(userId: string): Promise<PasskeySummary[]> {
    return this.stored
      .filter((passkey) => passkey.userId === userId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map(({ userId: _userId, ...summary }) => summary);
  }
}
