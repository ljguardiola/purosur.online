import { restorableSnapshotsSchema } from "@purosur/contracts";
import type { RestorableGenerations } from "@purosur/domain/backups/use-cases";
import { type CloudClientDeps, getFromCloud } from "../platform/cloud-client";

const SNAPSHOTS_PATH = "/api/devices/current/snapshots";

export interface CloudRestorableGenerations {
  generations: RestorableGenerations;
  downloadUrlOf: (generationId: string) => string | undefined;
}

export function createCloudRestorableGenerations({
  cloud,
  deviceToken,
}: {
  cloud: CloudClientDeps;
  deviceToken: string;
}): CloudRestorableGenerations {
  const downloadUrls = new Map<string, string>();
  return {
    generations: {
      async list() {
        const answered = await getFromCloud(cloud, SNAPSHOTS_PATH, {
          authorization: `Bearer ${deviceToken}`,
        });
        if (answered.kind !== "ok") {
          return { kind: "unreachable" };
        }
        const listing = restorableSnapshotsSchema.safeParse(answered.body);
        if (!listing.success) {
          return { kind: "unreachable" };
        }
        downloadUrls.clear();
        for (const generation of listing.data.generations) {
          downloadUrls.set(generation.generation_id, generation.download_url);
        }
        return {
          kind: "listed",
          generations: listing.data.generations.map((generation) => ({
            generationId: generation.generation_id,
            registerId: listing.data.register_id,
            createdAt: new Date(generation.created_at),
            size: generation.size,
            sha256: generation.sha256,
            keyVersion: generation.key_version,
          })),
        };
      },
    },
    downloadUrlOf: (generationId) => downloadUrls.get(generationId),
  };
}
