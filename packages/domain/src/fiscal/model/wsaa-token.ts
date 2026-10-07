export const WSAA_TOKEN_RENEWAL_LEAD_MS = 60 * 60 * 1000;

export interface WsaaTokenExpiry {
  expiresAt: Date;
}

export function isWsaaTokenValid({ expiresAt }: WsaaTokenExpiry, now: Date): boolean {
  return now.getTime() < expiresAt.getTime();
}

export function isWsaaTokenDueForRenewal(token: WsaaTokenExpiry | null, now: Date): boolean {
  return token === null || token.expiresAt.getTime() - now.getTime() < WSAA_TOKEN_RENEWAL_LEAD_MS;
}
