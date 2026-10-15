import type { Clock } from "../../shared/index.js";
import {
  isSettlingSnapshotRefusal,
  type LocalSnapshotGeneration,
} from "../model/local-snapshot-generation.js";
import type { LocalSnapshotGenerations, SnapshotUploadCloud } from "./snapshot-upload-ports.js";

export interface UploadPendingSnapshotGenerationsPorts<Authorization> {
  generations: LocalSnapshotGenerations;
  cloud: SnapshotUploadCloud<Authorization>;
  clock: Clock;
}

export interface SnapshotUploadTally {
  uploaded: number;
  refused: number;
  failed: number;
}

export type UploadPendingSnapshotGenerationsOutcome =
  | { kind: "every_pending_tried"; tally: SnapshotUploadTally }
  | { kind: "cloud_unreachable"; tally: SnapshotUploadTally };

type GenerationUpload = keyof SnapshotUploadTally | "unreachable";

async function uploadGeneration<Authorization>(
  { generations, cloud, clock }: UploadPendingSnapshotGenerationsPorts<Authorization>,
  generation: LocalSnapshotGeneration,
): Promise<GenerationUpload> {
  const object = await generations.objectOf(generation);
  if (object === undefined) {
    await generations.markRefused(generation, clock.now());
    return "refused";
  }
  const declared = await cloud.declare(generation);
  if (declared.kind === "refused") {
    if (!isSettlingSnapshotRefusal(declared.code)) {
      return "failed";
    }
    await generations.markRefused(generation, clock.now());
    return "refused";
  }
  if (declared.kind !== "accepted") {
    return declared.kind;
  }
  const stored = await cloud.putObject(declared.authorization, object);
  if (stored !== "done") {
    return stored;
  }
  const confirmed = await cloud.confirmUploaded(generation);
  if (confirmed !== "done") {
    return confirmed;
  }
  await generations.markUploaded(generation, clock.now());
  return "uploaded";
}

export async function uploadPendingSnapshotGenerations<Authorization>(
  ports: UploadPendingSnapshotGenerationsPorts<Authorization>,
): Promise<UploadPendingSnapshotGenerationsOutcome> {
  const tally: SnapshotUploadTally = { uploaded: 0, refused: 0, failed: 0 };
  for (const generation of await ports.generations.pendingNewestFirst()) {
    const upload = await uploadGeneration(ports, generation);
    if (upload === "unreachable") {
      tally.failed += 1;
      return { kind: "cloud_unreachable", tally };
    }
    tally[upload] += 1;
  }
  return { kind: "every_pending_tried", tally };
}
