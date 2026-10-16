import type { SnapshotLifecycleRules } from "../../model/snapshot-lifecycle-rules.js";
import type {
  SnapshotBackupGenerationFacts,
  SnapshotBackupRegister,
  SnapshotBackupsReader,
} from "../snapshot-backups-read-ports.js";

export class FakeSnapshotBackupsReader implements SnapshotBackupsReader {
  private readonly registers: SnapshotBackupRegister[] = [];
  private readonly generations: SnapshotBackupGenerationFacts[] = [];
  private rules: SnapshotLifecycleRules | undefined;

  seedRegister(register: SnapshotBackupRegister): void {
    this.registers.push({ ...register });
  }

  seedRules(rules: SnapshotLifecycleRules): void {
    this.rules = { ...rules };
  }

  seedGeneration(
    generation: Partial<SnapshotBackupGenerationFacts> & Pick<SnapshotBackupGenerationFacts, "id">,
  ): void {
    this.generations.push({
      registerId: "register-1",
      deviceId: "device-1",
      createdAt: new Date("2026-10-14T12:00:00.000Z"),
      size: 1024,
      sha256: "a".repeat(64),
      keyVersion: 1,
      status: "verified",
      failureReason: null,
      uploadReportedAt: null,
      pruned: false,
      objectDeleted: false,
      onRegisterDisk: false,
      ...structuredClone(generation),
    });
  }

  async registersForBackups(): Promise<SnapshotBackupRegister[]> {
    return this.registers.map((register) => ({ ...register }));
  }

  async registerExists(registerId: string): Promise<boolean> {
    return this.registers.some((register) => register.id === registerId);
  }

  async lifecycleRules(): Promise<SnapshotLifecycleRules | undefined> {
    return this.rules ? { ...this.rules } : undefined;
  }

  async generationsOf(registerId: string): Promise<SnapshotBackupGenerationFacts[]> {
    return this.generations
      .filter((generation) => generation.registerId === registerId)
      .map((generation) => structuredClone(generation));
  }
}
