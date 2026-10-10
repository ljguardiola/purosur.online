export function registerHoldsOfflineAuthorizationCode({
  lastPullSince,
  codeChangeSeq,
}: {
  lastPullSince: number | null;
  codeChangeSeq: number | null;
}): boolean {
  return lastPullSince !== null && codeChangeSeq !== null && lastPullSince >= codeChangeSeq;
}
