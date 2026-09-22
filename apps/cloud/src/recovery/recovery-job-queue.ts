export interface RecoveryRequest {
  email: string;
  requestedAt: Date;
}

/**
 * The boundary between `POST /users/recovery/request` and however the recovery-request job
 * actually gets enqueued, so the route's tests never have to touch graphile-worker or a real
 * database. Only an admitted request ever reaches this queue: a rejected one is bookkept
 * synchronously by `recovery-rejected-attempt-accumulator.ts` instead.
 */
export interface RecoveryJobQueue {
  enqueueRecoveryRequest(request: RecoveryRequest): Promise<void>;
}
