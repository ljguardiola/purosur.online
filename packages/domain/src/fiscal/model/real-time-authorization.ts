export const ROUND_TRIP_SAMPLE_SIZE = 12;

export function medianRoundTripMs(samples: readonly number[]): number | null {
  const recent = samples.slice(-ROUND_TRIP_SAMPLE_SIZE).sort((a, b) => a - b);
  if (recent.length === 0) {
    return null;
  }
  const middle = Math.floor(recent.length / 2);
  if (recent.length % 2 === 1) {
    return recent[middle] as number;
  }
  return Math.round(((recent[middle - 1] as number) + (recent[middle] as number)) / 2);
}
