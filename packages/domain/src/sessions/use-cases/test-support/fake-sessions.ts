import type { SessionStore } from "../session-store.js";
import type { Sessions, StoredSession } from "../sessions.js";

export class FakeSessions implements Sessions {
  private readonly stored = new Map<string, StoredSession>();

  seedSession(sessionKey: string, session: StoredSession): void {
    this.stored.set(sessionKey, session);
  }

  async findSession(sessionKey: string): Promise<StoredSession | undefined> {
    return this.stored.get(sessionKey);
  }
}

export class FakeSessionStore implements SessionStore {
  readonly endedSessions: { sessionKey: string; at: Date }[] = [];
  readonly recordedActivity: { sessionKey: string; at: Date }[] = [];

  async endSession(sessionKey: string, at: Date): Promise<void> {
    this.endedSessions.push({ sessionKey, at });
  }

  async recordSessionActivity(sessionKey: string, at: Date): Promise<void> {
    this.recordedActivity.push({ sessionKey, at });
  }
}
