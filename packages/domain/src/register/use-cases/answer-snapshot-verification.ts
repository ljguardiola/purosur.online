import type { SnapshotStore } from "./snapshot-generations.js";

export interface AnswerSnapshotVerificationPorts {
  store: SnapshotStore;
}

export interface AnswerSnapshotVerificationInput {
  registerId: string;
  generationIds: readonly string[];
}

export async function answerSnapshotVerification(
  { store }: AnswerSnapshotVerificationPorts,
  { registerId, generationIds }: AnswerSnapshotVerificationInput,
): Promise<string[]> {
  const generations = await store.transaction((tx) =>
    tx.generationsAmong(registerId, generationIds),
  );
  return generations
    .filter((generation) => generation.status === "verified")
    .map((generation) => generation.id);
}
