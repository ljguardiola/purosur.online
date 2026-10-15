import type { SnapshotCorruptionStage } from "../../model/snapshot-generation.js";
import type {
  SnapshotCorruptionCloud,
  SnapshotCorruptionReports,
} from "../snapshot-corruption-ports.js";
import type { SnapshotCloudStep } from "../snapshot-upload-ports.js";

export class FakeSnapshotCorruptionReports implements SnapshotCorruptionReports {
  stage: SnapshotCorruptionStage | undefined;
  calls: string[];

  constructor(calls: string[] = [], stage?: SnapshotCorruptionStage) {
    this.calls = calls;
    this.stage = stage;
  }

  async pending(): Promise<SnapshotCorruptionStage | undefined> {
    return this.stage;
  }

  async record(stage: SnapshotCorruptionStage): Promise<void> {
    this.calls.push(`record ${stage}`);
    this.stage = stage;
  }

  async settle(): Promise<void> {
    this.calls.push("settle");
    this.stage = undefined;
  }
}

export class FakeSnapshotCorruptionCloud implements SnapshotCorruptionCloud {
  answer: SnapshotCloudStep = "done";
  reported: SnapshotCorruptionStage[] = [];

  async report(stage: SnapshotCorruptionStage): Promise<SnapshotCloudStep> {
    this.reported.push(stage);
    return this.answer;
  }
}
