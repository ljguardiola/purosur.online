import { readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type SnapshotManifest, snapshotManifestSchema } from "@purosur/contracts";
import type { SnapshotSequences } from "@purosur/domain";
import { type Durability, nodeDurability } from "./durable-files";

const MANIFEST_SUFFIX = ".json";
const OBJECT_SUFFIX = ".snapshot";
const TEMPORARY_SUFFIX = ".tmp";

export function manifestPath(folder: string, generationId: string): string {
  return join(folder, `${generationId}${MANIFEST_SUFFIX}`);
}

export function objectPath(folder: string, generationId: string): string {
  return join(folder, `${generationId}${OBJECT_SUFFIX}`);
}

export function temporaryCopyPath(folder: string, generationId: string): string {
  return join(folder, `${generationId}.sqlite${TEMPORARY_SUFFIX}`);
}

export function temporaryObjectPath(folder: string, generationId: string): string {
  return `${objectPath(folder, generationId)}${TEMPORARY_SUFFIX}`;
}

export async function writeManifest(
  folder: string,
  manifest: SnapshotManifest,
  durability: Durability = nodeDurability,
): Promise<void> {
  const target = manifestPath(folder, manifest.generation_id);
  const temporary = `${target}${TEMPORARY_SUFFIX}`;
  await writeFile(temporary, JSON.stringify(manifest));
  await durability.file(temporary);
  await rename(temporary, target);
  await durability.folder(folder);
}

async function namesIn(folder: string): Promise<string[]> {
  try {
    return await readdir(folder);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function readManifest(folder: string, name: string): Promise<SnapshotManifest | undefined> {
  try {
    const parsed = snapshotManifestSchema.safeParse(
      JSON.parse(await readFile(join(folder, name), "utf8")),
    );
    return parsed.success && `${parsed.data.generation_id}${MANIFEST_SUFFIX}` === name
      ? parsed.data
      : undefined;
  } catch {
    return undefined;
  }
}

function newestFirst(a: SnapshotManifest, b: SnapshotManifest): number {
  return b.created_at.localeCompare(a.created_at) || b.generation_id.localeCompare(a.generation_id);
}

export async function readManifests(folder: string): Promise<SnapshotManifest[]> {
  const names = (await namesIn(folder)).filter((name) => name.endsWith(MANIFEST_SUFFIX));
  const manifests = await Promise.all(names.map((name) => readManifest(folder, name)));
  return manifests
    .filter((manifest): manifest is SnapshotManifest => manifest !== undefined)
    .sort(newestFirst);
}

export function lastGenerationSequences(
  manifests: readonly SnapshotManifest[],
): SnapshotSequences | undefined {
  const [newest] = manifests;
  return newest === undefined
    ? undefined
    : { lastDeviceSeq: newest.last_device_seq, pullCursor: newest.pull_cursor };
}

export function pendingManifests(manifests: readonly SnapshotManifest[]): SnapshotManifest[] {
  return manifests.filter(
    (manifest) => manifest.uploaded_at === null && manifest.refused_at === null,
  );
}

export async function removeLeftovers(folder: string): Promise<void> {
  const names = await namesIn(folder);
  const withManifest = new Set(
    names
      .filter((name) => name.endsWith(MANIFEST_SUFFIX))
      .map((name) => name.slice(0, -MANIFEST_SUFFIX.length)),
  );
  const leftovers = names.filter(
    (name) =>
      name.endsWith(TEMPORARY_SUFFIX) ||
      (name.endsWith(OBJECT_SUFFIX) && !withManifest.has(name.slice(0, -OBJECT_SUFFIX.length))),
  );
  await Promise.all(leftovers.map((name) => rm(join(folder, name), { force: true })));
}
