import type { SnapshotCorruptionStage } from "../../model/snapshot-generation.js";
import type { SnapshotLifecycleRules } from "../../model/snapshot-lifecycle-rules.js";
import type {
  NewSnapshotGeneration,
  SnapshotGeneration,
  SnapshotObjectContent,
  SnapshotObjects,
  SnapshotSettlement,
  SnapshotStore,
  SnapshotStoreTransaction,
} from "../snapshot-generations.js";

export interface FakeRetentionFreeze {
  registerId: string;
  stage: SnapshotCorruptionStage;
  frozenAt: Date;
}

export interface FakeSnapshotState {
  keyVersions: { registerId: string; version: number }[];
  generations: SnapshotGeneration[];
  freezes: FakeRetentionFreeze[];
  lifecycleRules: SnapshotLifecycleRules | undefined;
}

type WriteOperation =
  | "recordDeclaredGeneration"
  | "recordUploadReported"
  | "settleGeneration"
  | "freezeRetention"
  | "markPruned"
  | "markObjectDeleted";

class FakeSnapshotStoreTransaction implements SnapshotStoreTransaction {
  private readonly state: FakeSnapshotState;
  private readonly store: FakeSnapshotStore;

  constructor(state: FakeSnapshotState, store: FakeSnapshotStore) {
    this.state = state;
    this.store = store;
  }

  async lockRegisterSnapshots(registerId: string): Promise<void> {
    this.store.operationOrder.push(`lockRegisterSnapshots:${registerId}`);
  }

  async snapshotKeyVersions(registerId: string): Promise<number[]> {
    this.store.operationOrder.push("snapshotKeyVersions");
    return this.state.keyVersions
      .filter((key) => key.registerId === registerId)
      .map((key) => key.version);
  }

  async findGeneration(generationId: string): Promise<SnapshotGeneration | undefined> {
    this.store.operationOrder.push("findGeneration");
    const found = this.state.generations.find((generation) => generation.id === generationId);
    return found ? structuredClone(found) : undefined;
  }

  async recordDeclaredGeneration(generation: NewSnapshotGeneration): Promise<void> {
    this.beforeWrite("recordDeclaredGeneration");
    this.state.generations.push({
      ...structuredClone(generation),
      status: "declared",
      failureReason: null,
      uploadReportedAt: null,
      pruned: false,
      objectDeleted: false,
    });
  }

  async recordUploadReported(generationId: string, reportedAt: Date): Promise<void> {
    this.beforeWrite("recordUploadReported");
    const generation = this.generation(generationId);
    if (generation.status === "declared") {
      generation.status = "uploaded";
      generation.uploadReportedAt = new Date(reportedAt);
    }
  }

  async unsettledGenerations(): Promise<SnapshotGeneration[]> {
    this.store.operationOrder.push("unsettledGenerations");
    return this.state.generations
      .filter((generation) => generation.status === "declared" || generation.status === "uploaded")
      .map((generation) => structuredClone(generation));
  }

  async settleGeneration(generationId: string, settlement: SnapshotSettlement): Promise<void> {
    this.beforeWrite("settleGeneration");
    const generation = this.generation(generationId);
    generation.status = settlement.kind;
    generation.failureReason = settlement.kind === "failed" ? settlement.reason : null;
  }

  async freezeRetention(
    registerId: string,
    stage: SnapshotCorruptionStage,
    frozenAt: Date,
  ): Promise<void> {
    this.beforeWrite("freezeRetention");
    if (!this.state.freezes.some((freeze) => freeze.registerId === registerId)) {
      this.state.freezes.push({ registerId, stage, frozenAt: new Date(frozenAt) });
    }
  }

  async retentionFrozen(registerId: string): Promise<boolean> {
    this.store.operationOrder.push("retentionFrozen");
    return this.state.freezes.some((freeze) => freeze.registerId === registerId);
  }

  async lifecycleRules(): Promise<SnapshotLifecycleRules | undefined> {
    this.store.operationOrder.push("lifecycleRules");
    return this.state.lifecycleRules ? { ...this.state.lifecycleRules } : undefined;
  }

  async registersWithGenerations(): Promise<string[]> {
    this.store.operationOrder.push("registersWithGenerations");
    return [...new Set(this.state.generations.map((generation) => generation.registerId))];
  }

  async generationsOf(registerId: string): Promise<SnapshotGeneration[]> {
    this.store.operationOrder.push("generationsOf");
    return this.state.generations
      .filter((generation) => generation.registerId === registerId)
      .map((generation) => structuredClone(generation));
  }

  async markPruned(generationIds: readonly string[]): Promise<void> {
    this.beforeWrite("markPruned");
    for (const id of generationIds) {
      this.generation(id).pruned = true;
    }
  }

  async prunedWithObject(registerId: string): Promise<SnapshotGeneration[]> {
    this.store.operationOrder.push("prunedWithObject");
    return this.state.generations
      .filter(
        (generation) =>
          generation.registerId === registerId && generation.pruned && !generation.objectDeleted,
      )
      .map((generation) => structuredClone(generation));
  }

  async markObjectDeleted(generationId: string): Promise<void> {
    this.beforeWrite("markObjectDeleted");
    this.generation(generationId).objectDeleted = true;
  }

  private generation(generationId: string): SnapshotGeneration {
    const generation = this.state.generations.find((row) => row.id === generationId);
    if (!generation) {
      throw new Error(`no generation ${generationId}`);
    }
    return generation;
  }

  private beforeWrite(operation: WriteOperation): void {
    this.store.operationOrder.push(operation);
    if (this.store.failingWrites.has(operation)) {
      throw new Error(`${operation} failed`);
    }
  }
}

export class FakeSnapshotStore implements SnapshotStore {
  private state: FakeSnapshotState = {
    keyVersions: [],
    generations: [],
    freezes: [],
    lifecycleRules: undefined,
  };

  failingWrites = new Set<WriteOperation>();
  operationOrder: string[] = [];
  transactionsOpened = 0;

  seedKeyVersions(registerId: string, ...versions: number[]): void {
    for (const version of versions) {
      this.state.keyVersions.push({ registerId, version });
    }
  }

  seedGeneration(generation: Partial<SnapshotGeneration> & Pick<SnapshotGeneration, "id">): void {
    this.state.generations.push({
      registerId: "register-1",
      deviceId: "device-1",
      createdAt: new Date("2026-10-14T12:00:00.000Z"),
      size: 1024,
      sha256: "a".repeat(64),
      keyVersion: 1,
      status: "declared",
      failureReason: null,
      uploadReportedAt: null,
      pruned: false,
      objectDeleted: false,
      ...structuredClone(generation),
    });
  }

  seedFreeze(freeze: FakeRetentionFreeze): void {
    this.state.freezes.push(structuredClone(freeze));
  }

  seedLifecycleRules(rules: SnapshotLifecycleRules): void {
    this.state.lifecycleRules = { ...rules };
  }

  snapshot(): FakeSnapshotState {
    return structuredClone(this.state);
  }

  async transaction<TOutcome>(
    work: (tx: SnapshotStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    this.transactionsOpened += 1;
    const before = structuredClone(this.state);
    try {
      return await work(new FakeSnapshotStoreTransaction(this.state, this));
    } catch (error) {
      this.state = before;
      throw error;
    }
  }
}

export class FakeSnapshotObjects implements SnapshotObjects {
  private readonly objects = new Map<string, SnapshotObjectContent>();
  readonly inspected: string[] = [];
  readonly removed: string[] = [];
  readonly failingRemovals = new Set<string>();

  seed(registerId: string, generationId: string, content: SnapshotObjectContent): void {
    this.objects.set(`${registerId}/${generationId}`, { ...content });
  }

  has(registerId: string, generationId: string): boolean {
    return this.objects.has(`${registerId}/${generationId}`);
  }

  async inspect(
    registerId: string,
    generationId: string,
  ): Promise<SnapshotObjectContent | undefined> {
    this.inspected.push(`${registerId}/${generationId}`);
    const content = this.objects.get(`${registerId}/${generationId}`);
    return content ? { ...content } : undefined;
  }

  async remove(registerId: string, generationId: string): Promise<void> {
    const key = `${registerId}/${generationId}`;
    if (this.failingRemovals.has(key)) {
      throw new Error(`removing ${key} failed`);
    }
    this.removed.push(key);
    this.objects.delete(key);
  }
}
