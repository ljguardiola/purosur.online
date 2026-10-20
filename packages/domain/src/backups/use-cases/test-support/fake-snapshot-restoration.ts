import type {
  RestorableGeneration,
  RestorableGenerations,
  RestorableGenerationsAnswer,
  SnapshotStaging,
  SnapshotStagingAnswer,
} from "../snapshot-restoration-ports.js";

export class FakeRestorableGenerations implements RestorableGenerations {
  private readonly answer: RestorableGenerationsAnswer;

  constructor(answer: RestorableGenerationsAnswer) {
    this.answer = answer;
  }

  async list(): Promise<RestorableGenerationsAnswer> {
    return this.answer;
  }
}

export class FakeSnapshotStaging implements SnapshotStaging {
  readonly attempted: string[] = [];
  private readonly answers: Record<string, SnapshotStagingAnswer>;

  constructor(answers: Record<string, SnapshotStagingAnswer> = {}) {
    this.answers = answers;
  }

  async stage(generation: RestorableGeneration): Promise<SnapshotStagingAnswer> {
    this.attempted.push(generation.generationId);
    return this.answers[generation.generationId] ?? { kind: "staged" };
  }
}

export function restorableGeneration(
  generationId: string,
  createdAt: string,
): RestorableGeneration {
  return {
    generationId,
    registerId: "register-1",
    createdAt: new Date(createdAt),
    size: 1_000,
    sha256: "a".repeat(64),
    keyVersion: 1,
  };
}
