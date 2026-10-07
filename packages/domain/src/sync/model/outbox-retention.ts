export const OUTBOX_RETENTION_AFTER_ACK_MS = 30 * 24 * 60 * 60 * 1000;

export function outboxPruneCutoff(now: Date): Date {
  return new Date(now.getTime() - OUTBOX_RETENTION_AFTER_ACK_MS);
}
