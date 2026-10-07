export const ARCA_VITALITY_CHECK_INTERVAL_MS = 30_000;
export const ARCA_REACHABILITY_HORIZON_MS = 90_000;

export interface ArcaVitalityAnswer {
  appServer: string;
  dbServer: string;
  authServer: string;
}

export interface ArcaReachabilityEvidence {
  lastVitalityCheckOkAt: Date | null;
  lastWsfeCallOkAt: Date | null;
}

export function isArcaVitalityAnswerOk({
  appServer,
  dbServer,
  authServer,
}: ArcaVitalityAnswer): boolean {
  return appServer === "OK" && dbServer === "OK" && authServer === "OK";
}

export function isArcaReachable(
  { lastVitalityCheckOkAt, lastWsfeCallOkAt }: ArcaReachabilityEvidence,
  now: Date,
): boolean {
  return [lastVitalityCheckOkAt, lastWsfeCallOkAt].some(
    (evidence) =>
      evidence !== null && now.getTime() - evidence.getTime() <= ARCA_REACHABILITY_HORIZON_MS,
  );
}
