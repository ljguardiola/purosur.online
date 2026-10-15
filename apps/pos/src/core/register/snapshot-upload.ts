import { readFile } from "node:fs/promises";
import {
  type CloudErrorCode,
  type SnapshotManifest,
  type SnapshotUploadBody,
  snapshotUploadAnswerSchema,
} from "@purosur/contracts";
import { type CloudClientDeps, postToCloudWithBearer } from "../platform/cloud-client";
import type { Durability } from "./durable-files";
import {
  objectPath,
  pendingManifests,
  readManifests,
  writeManifest,
} from "./snapshot-generations-folder";

const DECLARATION_PATH = "/api/devices/current/snapshots";

const REFUSAL_CODES: readonly CloudErrorCode[] = ["conflict", "validation_failed"];

export interface UploadSummary {
  uploaded: number;
  refused: number;
  failed: number;
}

export interface UploadDeps {
  folder: string;
  deviceToken: string;
  cloud: CloudClientDeps;
  now: () => Date;
  durability?: Durability;
}

type Step = "uploaded" | "refused" | "failed" | "unreachable";

async function objectOf(folder: string, generationId: string): Promise<Buffer | undefined> {
  try {
    return await readFile(objectPath(folder, generationId));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

async function uploadGeneration(
  { folder, deviceToken, cloud, now, durability }: UploadDeps,
  manifest: SnapshotManifest,
): Promise<Step> {
  const settled = (field: "uploaded_at" | "refused_at") =>
    writeManifest(folder, { ...manifest, [field]: now().toISOString() }, durability);

  const object = await objectOf(folder, manifest.generation_id);
  if (object === undefined) {
    await settled("refused_at");
    return "refused";
  }

  const declaration: SnapshotUploadBody = {
    generation_id: manifest.generation_id,
    size: manifest.size,
    sha256: manifest.sha256,
    key_version: manifest.key_version,
  };
  const declared = await postToCloudWithBearer(cloud, DECLARATION_PATH, deviceToken, declaration);
  if (declared.kind === "unreachable") {
    return "unreachable";
  }
  if (declared.kind === "error") {
    if (REFUSAL_CODES.includes(declared.error.code)) {
      await settled("refused_at");
      return "refused";
    }
    return "failed";
  }
  const answer = snapshotUploadAnswerSchema.safeParse(declared.body);
  if (!answer.success) {
    return "failed";
  }

  let stored: Response;
  try {
    stored = await cloud.fetch(answer.data.upload_url, {
      method: "PUT",
      headers: answer.data.required_headers,
      body: object,
    });
  } catch {
    return "unreachable";
  }
  if (!stored.ok) {
    return "failed";
  }

  const confirmed = await postToCloudWithBearer(
    cloud,
    `${DECLARATION_PATH}/${manifest.generation_id}/uploaded`,
    deviceToken,
  );
  if (confirmed.kind !== "ok") {
    return confirmed.kind === "unreachable" ? "unreachable" : "failed";
  }
  await settled("uploaded_at");
  return "uploaded";
}

export async function uploadPendingGenerations(deps: UploadDeps): Promise<UploadSummary> {
  const summary: UploadSummary = { uploaded: 0, refused: 0, failed: 0 };
  for (const manifest of pendingManifests(await readManifests(deps.folder))) {
    const step = await uploadGeneration(deps, manifest);
    if (step === "uploaded" || step === "refused") {
      summary[step] += 1;
    } else {
      summary.failed += 1;
      if (step === "unreachable") {
        break;
      }
    }
  }
  return summary;
}
