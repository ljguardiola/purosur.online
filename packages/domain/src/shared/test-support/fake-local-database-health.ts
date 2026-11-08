import type { LocalDatabaseHealth } from "../local-database-health.js";

export type LocalDatabaseHealthCall = "damageRecorded" | "integrityHolds" | "recordDamage";

export class FakeLocalDatabaseHealth implements LocalDatabaseHealth {
  calls: LocalDatabaseHealthCall[] = [];
  damage: boolean;
  integrity: boolean;

  constructor(state: { damageRecorded?: boolean; integrityHolds?: boolean } = {}) {
    this.damage = state.damageRecorded ?? false;
    this.integrity = state.integrityHolds ?? true;
  }

  async damageRecorded(): Promise<boolean> {
    this.calls.push("damageRecorded");
    return this.damage;
  }

  async integrityHolds(): Promise<boolean> {
    this.calls.push("integrityHolds");
    return this.integrity;
  }

  async recordDamage(): Promise<void> {
    this.calls.push("recordDamage");
    this.damage = true;
  }
}
