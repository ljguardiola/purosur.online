export interface PasskeySummary {
  id: string;
  name: string;
  createdAt: Date;
  lastUsedAt: Date | null;
}

export interface Passkeys {
  // Ordered by creation.
  passkeySummaries(userId: string): Promise<PasskeySummary[]>;
}
