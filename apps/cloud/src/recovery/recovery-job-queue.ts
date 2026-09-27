export interface RecoveryRequest {
  email: string;
  requestedAt: Date;
}

export interface RecoveryJobQueue {
  enqueueRecoveryRequest(request: RecoveryRequest): Promise<void>;
}
