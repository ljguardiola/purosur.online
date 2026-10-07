export interface WsaaTokenExpiry {
  expiresAt: Date;
}

export function isWsaaTokenValid({ expiresAt }: WsaaTokenExpiry, now: Date): boolean {
  return now.getTime() < expiresAt.getTime();
}

export function isWsaaTokenDueForRenewal(token: WsaaTokenExpiry | null, now: Date): boolean {
  return token === null || !isWsaaTokenValid(token, now);
}
