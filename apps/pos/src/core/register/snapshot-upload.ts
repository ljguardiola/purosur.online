import { type SnapshotUploadBody, snapshotUploadAnswerSchema } from "@purosur/contracts";
import {
  type SnapshotUploadCloud,
  type UploadPendingSnapshotGenerationsOutcome,
  uploadPendingSnapshotGenerations,
} from "@purosur/domain/register/use-cases";
import { type CloudClientDeps, postToCloudWithBearer } from "../platform/cloud-client";
import type { Durability } from "./durable-files";
import { folderSnapshotGenerations } from "./snapshot-generations-folder";

const DECLARATION_PATH = "/api/devices/current/snapshots";

export interface UploadDeps {
  folder: string;
  deviceToken: string;
  cloud: CloudClientDeps;
  now: () => Date;
  durability?: Durability;
}

interface SnapshotUploadDestination {
  url: string;
  headers: Record<string, string>;
}

export function cloudSnapshotUploads(
  cloud: CloudClientDeps,
  deviceToken: string,
): SnapshotUploadCloud<SnapshotUploadDestination> {
  return {
    async declare(generation) {
      const declaration: SnapshotUploadBody = {
        generation_id: generation.generationId,
        size: generation.size,
        sha256: generation.sha256,
        key_version: generation.keyVersion,
      };
      const declared = await postToCloudWithBearer(
        cloud,
        DECLARATION_PATH,
        deviceToken,
        declaration,
      );
      if (declared.kind === "unreachable") {
        return { kind: "unreachable" };
      }
      if (declared.kind === "error") {
        return { kind: "refused", code: declared.error.code };
      }
      const answer = snapshotUploadAnswerSchema.safeParse(declared.body);
      return answer.success
        ? {
            kind: "accepted",
            authorization: { url: answer.data.upload_url, headers: answer.data.required_headers },
            currentKeyVersion: answer.data.current_key_version,
          }
        : { kind: "failed" };
    },

    async putObject(authorization, object) {
      let stored: Response;
      try {
        stored = await cloud.fetch(authorization.url, {
          method: "PUT",
          headers: authorization.headers,
          body: object,
        });
      } catch {
        return "unreachable";
      }
      return stored.ok ? "done" : "failed";
    },

    async confirmUploaded(generation) {
      const confirmed = await postToCloudWithBearer(
        cloud,
        `${DECLARATION_PATH}/${generation.generationId}/uploaded`,
        deviceToken,
      );
      if (confirmed.kind === "ok") {
        return "done";
      }
      return confirmed.kind === "unreachable" ? "unreachable" : "failed";
    },
  };
}

export function uploadPendingGenerations({
  folder,
  deviceToken,
  cloud,
  now,
  durability,
}: UploadDeps): Promise<UploadPendingSnapshotGenerationsOutcome> {
  return uploadPendingSnapshotGenerations({
    generations: folderSnapshotGenerations(folder, durability),
    cloud: cloudSnapshotUploads(cloud, deviceToken),
    clock: { now },
  });
}
