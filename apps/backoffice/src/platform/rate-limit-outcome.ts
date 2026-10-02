type RateLimitOutcome = { kind: "rate_limited"; retryAfterSeconds: number } | { kind: "failed" };

export function rateLimitOutcome(response: Response): RateLimitOutcome {
  const header = response.headers.get("Retry-After");
  const seconds = header ? Number(header) : Number.NaN;
  return Number.isFinite(seconds) && seconds > 0
    ? { kind: "rate_limited", retryAfterSeconds: seconds }
    : { kind: "failed" };
}
