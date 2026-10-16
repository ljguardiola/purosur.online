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
  | {
      kind: "every_pending_tried";
      tally: SnapshotUploadTally;
      latestAnnouncedKeyVersion: number | undefined;
    }
  | {
      kind: "cloud_unreachable";
      tally: SnapshotUploadTally;
      latestAnnouncedKeyVersion: number | undefined;
    };

type GenerationUpload = keyof SnapshotUploadTally | "unreachable";

interface AnnouncedKeyVersions {
  latest: number | undefined;
}

async function uploadGeneration<Authorization>(
  { generations, cloud, clock }: UploadPendingSnapshotGenerationsPorts<Authorization>,
  generation: LocalSnapshotGeneration,
  announced: AnnouncedKeyVersions,
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
  announced.latest = Math.max(announced.latest ?? 0, declared.currentKeyVersion);
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
  const announced: AnnouncedKeyVersions = { latest: undefined };
  for (const generation of await ports.generations.pendingNewestFirst()) {
    const upload = await uploadGeneration(ports, generation, announced);
    if (upload === "unreachable") {
      tally.failed += 1;
      return { kind: "cloud_unreachable", tally, latestAnnouncedKeyVersion: announced.latest };
    }
    tally[upload] += 1;
  }
  return { kind: "every_pending_tried", tally, latestAnnouncedKeyVersion: announced.latest };
}
