export function minutesElapsed(issuedAt: string, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(issuedAt).getTime()) / 60_000));
}

export function minutesRemaining(expiresAt: string, now: Date): number {
  return Math.max(1, Math.ceil((new Date(expiresAt).getTime() - now.getTime()) / 60_000));
}
