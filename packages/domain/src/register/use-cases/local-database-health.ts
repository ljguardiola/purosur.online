export interface LocalDatabaseHealth {
  damageRecorded(): Promise<boolean>;
  integrityHolds(): Promise<boolean>;
  recordDamage(): Promise<void>;
}

export interface LocalDatabaseHealthPorts {
  health: LocalDatabaseHealth;
}
