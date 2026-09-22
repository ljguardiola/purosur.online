export interface RecoveryRequest {
  email: string;
  requestedAt: Date;
  /** False when the rate limiter rejected the request: its job only audits, never issues a link. */
  admitted: boolean;
}

/**
 * The boundary between `POST /users/recovery/request` and however the recovery-request job
 * actually gets enqueued, so the route's tests never have to touch graphile-worker or a real
 * database.
 */
export interface RecoveryJobQueue {
  enqueueRecoveryRequest(request: RecoveryRequest): Promise<void>;
}
