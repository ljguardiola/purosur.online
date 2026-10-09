export const REGISTER_HEALTH_CHECK_HORIZON_MS = 15_000;
export const REGISTER_HEALTH_CHECK_INTERVAL_MS = 5_000;

export interface FiscalOnlineSignalEvidence {
  lastHealthCheckOkAt: Date | null;
  tokenValid: boolean;
  arcaReachable: boolean;
}

export function isRegisterFiscallyOnline(
  { lastHealthCheckOkAt, tokenValid, arcaReachable }: FiscalOnlineSignalEvidence,
  now: Date,
): boolean {
  return (
    lastHealthCheckOkAt !== null &&
    now.getTime() - lastHealthCheckOkAt.getTime() <= REGISTER_HEALTH_CHECK_HORIZON_MS &&
    tokenValid &&
    arcaReachable
  );
}
