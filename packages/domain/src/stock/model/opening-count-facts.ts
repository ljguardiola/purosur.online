export interface OpeningCountRecordedFact {
  movementId: string;
  productId: string;
  counted: number;
  expiresOn: string | null;
  countedAt: Date;
  actorId: string;
}

export interface OpeningCountWithdrawnFact {
  movementId: string;
  withdrawnMovementId: string;
  withdrawnAt: Date;
  actorId: string;
}
