export interface WsaaTokenExpiry {
  expiresAt: Date;
}

export function isWsaaTokenValid({ expiresAt }: WsaaTokenExpiry, now: Date): boolean {
  return now.getTime() < expiresAt.getTime();
}

export function isWsaaTokenDueForRenewal(token: WsaaTokenExpiry | null, now: Date): boolean {
  return token === null || !isWsaaTokenValid(token, now);
}

export const WSAA_ALREADY_AUTHENTICATED_RETRY_MINUTES = 10;

export const WSAA_ALREADY_AUTHENTICATED_RETRY_MS =
  WSAA_ALREADY_AUTHENTICATED_RETRY_MINUTES * 60 * 1000;

export function isWsaaTokenRetryDue(lastRefusedAt: Date | null, now: Date): boolean {
  return (
    lastRefusedAt === null ||
    now.getTime() - lastRefusedAt.getTime() >= WSAA_ALREADY_AUTHENTICATED_RETRY_MS
  );
}
