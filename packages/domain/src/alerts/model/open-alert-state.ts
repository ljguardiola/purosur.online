export function isOpenAlert(alert: { resolvedAt: Date | null }): boolean {
  return alert.resolvedAt === null;
}
