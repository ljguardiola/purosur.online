const ONE_HOUR_SECONDS = 60 * 60;

export function retryAfterSeconds(response: Response, fallbackSeconds = ONE_HOUR_SECONDS): number {
  const header = response.headers.get("Retry-After");
  const seconds = header ? Number(header) : Number.NaN;
  return Number.isFinite(seconds) && seconds > 0 ? seconds : fallbackSeconds;
}
