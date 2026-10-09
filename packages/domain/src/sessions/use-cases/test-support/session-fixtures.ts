import type { StoredSession } from "../sessions.js";

export const SESSION_KEY = "session-key-1";

export const CREATED_AT = new Date("2026-10-01T08:00:00.000Z");

export function storedSession(overrides: Partial<StoredSession> = {}): StoredSession {
  return {
    sessionId: "session-1",
    userId: "u-1",
    firstName: "Ana",
    locationId: "branch-1",
    createdAt: CREATED_AT,
    lastSeenAt: CREATED_AT,
    revokedAt: null,
    passkeyAuthorizedAt: null,
    userActive: true,
    isAdministrator: false,
    grantedPermissionKeys: [],
    ...overrides,
  };
}
