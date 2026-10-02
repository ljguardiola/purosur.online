export interface SessionStore {
  endSession(sessionKey: string, at: Date): Promise<void>;
  recordSessionActivity(sessionKey: string, at: Date): Promise<void>;
}
