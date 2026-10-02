// Generous relative to a WebAuthn prompt's own client-side timeout, so a slow biometric prompt never loses to server-side expiry.
export const CHALLENGE_TTL_MS = 5 * 60 * 1000;

export function isChallengeLive(issuedAt: Date, now: Date): boolean {
  return issuedAt.getTime() + CHALLENGE_TTL_MS > now.getTime();
}

export function challengeExpiryWindowStart(now: Date): Date {
  return new Date(now.getTime() - CHALLENGE_TTL_MS);
}
