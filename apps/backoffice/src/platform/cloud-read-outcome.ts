export type CloudReadOutcome<T> =
  | { kind: "ok"; value: T }
  | { kind: "unauthenticated" }
  | { kind: "forbidden" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };
