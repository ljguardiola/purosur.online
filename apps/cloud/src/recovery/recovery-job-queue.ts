/**
 * The boundary between `POST /users/recovery/request` and however the recovery-request job
 * actually gets enqueued, so the route's tests never have to touch graphile-worker or a real
 * database.
 */
export interface RecoveryJobQueue {
  enqueueRecoveryRequest(email: string): Promise<void>;
}
