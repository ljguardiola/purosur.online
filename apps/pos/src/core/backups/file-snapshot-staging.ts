import { createDecipheriv, createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { open, rename, rm, stat } from "node:fs/promises";
import { dirname } from "node:path";
import { pipeline } from "node:stream/promises";
import type {
  RestorableGeneration,
  SnapshotStaging,
  SnapshotStagingAnswer,
} from "@purosur/domain/backups/use-cases";
import { type Durability, nodeDurability } from "../register/durable-files";
import { checkCopy, SnapshotCopyFailed } from "../register/snapshot-copy";
import { snapshotAssociatedData } from "../register/snapshot-encryption";

const NONCE_BYTES = 12;
const TAG_BYTES = 16;

export interface FileSnapshotStagingDeps {
  fetch: (input: string, init: RequestInit) => Promise<Response>;
  downloadUrlOf: (generationId: string) => string | undefined;
  keys: readonly { version: number; key: Buffer }[];
  stagedPath: string;
  durability?: Durability;
}

async function download(
  fetchObject: FileSnapshotStagingDeps["fetch"],
  url: string,
  targetPath: string,
): Promise<{ size: number; sha256: string } | undefined> {
  let response: Response;
  try {
    response = await fetchObject(url, { method: "GET" });
  } catch {
    return undefined;
  }
  if (!response.ok || response.body === null) {
    return undefined;
  }
  const hash = createHash("sha256");
  let size = 0;
  const file = await open(targetPath, "w");
  try {
    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      hash.update(value);
      size += value.length;
      await file.write(value);
    }
  } catch {
    return undefined;
  } finally {
    await file.close();
  }
  return { size, sha256: hash.digest("hex") };
}

async function decrypt(
  objectPath: string,
  targetPath: string,
  key: Buffer,
  associatedData: Buffer,
): Promise<void> {
  const { size } = await stat(objectPath);
  if (size < NONCE_BYTES + TAG_BYTES) {
    throw new Error("the snapshot object is too short to be encrypted");
  }
  const object = await open(objectPath, "r");
  let nonce: Buffer;
  let tag: Buffer;
  try {
    nonce = Buffer.alloc(NONCE_BYTES);
    tag = Buffer.alloc(TAG_BYTES);
    await object.read(nonce, 0, NONCE_BYTES, 0);
    await object.read(tag, 0, TAG_BYTES, size - TAG_BYTES);
  } finally {
    await object.close();
  }
  const decipher = createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAAD(associatedData);
  decipher.setAuthTag(tag);
  await pipeline(
    createReadStream(objectPath, { start: NONCE_BYTES, end: size - TAG_BYTES - 1 }),
    decipher,
    createWriteStream(targetPath),
  );
}

function checkStaged(path: string): "integrity_check" | "foreign_key_check" | undefined {
  try {
    checkCopy(path);
    return undefined;
  } catch (error) {
    return error instanceof SnapshotCopyFailed && error.stage === "foreign_key_check"
      ? "foreign_key_check"
      : "integrity_check";
  }
}

export function createFileSnapshotStaging(deps: FileSnapshotStagingDeps): SnapshotStaging {
  const durability = deps.durability ?? nodeDurability;
  const downloadPath = `${deps.stagedPath}.download`;
  const partialPath = `${deps.stagedPath}.partial`;

  async function stage(generation: RestorableGeneration): Promise<SnapshotStagingAnswer> {
    const url = deps.downloadUrlOf(generation.generationId);
    const downloaded =
      url === undefined ? undefined : await download(deps.fetch, url, downloadPath);
    if (downloaded === undefined) {
      return { kind: "failed", stage: "download" };
    }
    if (downloaded.size !== generation.size || downloaded.sha256 !== generation.sha256) {
      return { kind: "failed", stage: "hash_mismatch" };
    }
    const key = deps.keys.find((held) => held.version === generation.keyVersion);
    if (key === undefined) {
      return { kind: "failed", stage: "missing_key_version" };
    }
    try {
      await decrypt(
        downloadPath,
        partialPath,
        key.key,
        snapshotAssociatedData({
          registerId: generation.registerId,
          keyVersion: generation.keyVersion,
          generationId: generation.generationId,
        }),
      );
    } catch {
      return { kind: "failed", stage: "decryption" };
    }
    await durability.file(partialPath);
    const failedCheck = checkStaged(partialPath);
    if (failedCheck !== undefined) {
      return { kind: "failed", stage: failedCheck };
    }
    await rename(partialPath, deps.stagedPath);
    await durability.folder(dirname(deps.stagedPath));
    return { kind: "staged" };
  }

  return {
    async stage(generation) {
      try {
        return await stage(generation);
      } finally {
        await rm(downloadPath, { force: true });
        await rm(partialPath, { force: true });
      }
    },
  };
}
