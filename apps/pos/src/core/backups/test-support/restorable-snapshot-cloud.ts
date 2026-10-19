import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { encryptSnapshotFile, snapshotAssociatedData } from "../../register/snapshot-encryption";

export const REGISTER_ID = "7d2f6c5e-1b0a-4f43-9a52-3c7d8e9f0a11";
export const DEVICE_TOKEN = "prefix.secret";
export const CLOUD_URL = "https://cloud.example.test";

export interface EncryptedSnapshot {
  generationId: string;
  keyVersion: number;
  createdAt: string;
  object: Buffer;
  size: number;
  sha256: string;
}

export async function encryptedSnapshot(options: {
  database: Buffer;
  generationId: string;
  keyVersion: number;
  key: Buffer;
  createdAt: string;
  registerId?: string;
}): Promise<EncryptedSnapshot> {
  const folder = await mkdtemp(join(tmpdir(), "encrypted-snapshot-"));
  try {
    const sourcePath = join(folder, "plain.sqlite");
    const targetPath = join(folder, "object");
    await writeFile(sourcePath, options.database);
    const { size, sha256 } = await encryptSnapshotFile({
      sourcePath,
      targetPath,
      key: options.key,
      associatedData: snapshotAssociatedData({
        registerId: options.registerId ?? REGISTER_ID,
        keyVersion: options.keyVersion,
        generationId: options.generationId,
      }),
    });
    return {
      generationId: options.generationId,
      keyVersion: options.keyVersion,
      createdAt: options.createdAt,
      object: await readFile(targetPath),
      size,
      sha256,
    };
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

export function sha256Of(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function downloadUrlOf(generationId: string): string {
  return `https://storage.example.test/objects/${generationId}`;
}

export function listedGeneration(snapshot: EncryptedSnapshot) {
  return {
    generation_id: snapshot.generationId,
    created_at: snapshot.createdAt,
    size: snapshot.size,
    sha256: snapshot.sha256,
    key_version: snapshot.keyVersion,
    download_url: downloadUrlOf(snapshot.generationId),
  };
}

export class FakeRestorableCloud {
  snapshots: EncryptedSnapshot[] = [];
  listing: "reachable" | "unreachable" | "refused" = "reachable";
  objectAnswer: "served" | "unreachable" | "missing" = "served";
  tampered = new Map<string, Buffer>();
  requests: { url: string; authorization: string | null }[] = [];

  readonly fetch = async (input: string, init: RequestInit = {}): Promise<Response> => {
    const url = new URL(input);
    this.requests.push({
      url: input,
      authorization: new Headers(init.headers).get("authorization"),
    });
    if (url.origin === CLOUD_URL && url.pathname === "/api/devices/current/snapshots") {
      if (this.listing === "unreachable") {
        throw new TypeError("fetch failed");
      }
      if (this.listing === "refused") {
        return Response.json({ code: "unauthorized", message: "no", details: [] }, { status: 401 });
      }
      return Response.json({
        register_id: REGISTER_ID,
        generations: this.snapshots.map(listedGeneration),
      });
    }
    if (this.objectAnswer === "unreachable") {
      throw new TypeError("fetch failed");
    }
    if (this.objectAnswer === "missing") {
      return new Response(null, { status: 404 });
    }
    const generationId = url.pathname.split("/").at(-1) ?? "";
    const object =
      this.tampered.get(generationId) ??
      this.snapshots.find((snapshot) => snapshot.generationId === generationId)?.object;
    return object === undefined
      ? new Response(null, { status: 404 })
      : new Response(new Uint8Array(object));
  };
}
