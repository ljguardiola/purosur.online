export const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
export const SESSION_ABSOLUTE_TIMEOUT_MS = 12 * 60 * 60 * 1000;

export interface SessionActivity {
  createdAt: Date;
  lastSeenAt: Date;
}

export function sessionExpiresAt(session: SessionActivity): Date {
  const idleDeadline = session.lastSeenAt.getTime() + SESSION_IDLE_TIMEOUT_MS;
  const absoluteDeadline = session.createdAt.getTime() + SESSION_ABSOLUTE_TIMEOUT_MS;
  return new Date(Math.min(idleDeadline, absoluteDeadline));
}

export function isSessionExpired(session: SessionActivity, now: Date): boolean {
  return sessionExpiresAt(session).getTime() <= now.getTime();
}
