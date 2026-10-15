import { readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type SnapshotManifest, snapshotManifestSchema } from "@purosur/contracts";
import {
  type LocalSnapshotGeneration,
  pendingSnapshotGenerationsNewestFirst,
} from "@purosur/domain";
import type { LocalSnapshotGenerations } from "@purosur/domain/register/use-cases";
import { type Durability, nodeDurability } from "./durable-files";

const MANIFEST_SUFFIX = ".json";
const OBJECT_SUFFIX = ".snapshot";
const TEMPORARY_SUFFIX = ".tmp";

function manifestPath(folder: string, generationId: string): string {
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

export async function readManifests(folder: string): Promise<SnapshotManifest[]> {
  const names = (await namesIn(folder)).filter((name) => name.endsWith(MANIFEST_SUFFIX));
  const manifests = await Promise.all(names.map((name) => readManifest(folder, name)));
  return manifests.filter((manifest): manifest is SnapshotManifest => manifest !== undefined);
}

function dateOrNull(instant: string | null): Date | null {
  return instant === null ? null : new Date(instant);
}

function generationOf(manifest: SnapshotManifest): LocalSnapshotGeneration {
  return {
    generationId: manifest.generation_id,
    createdAt: new Date(manifest.created_at),
    sequences: { lastDeviceSeq: manifest.last_device_seq, pullCursor: manifest.pull_cursor },
    keyVersion: manifest.key_version,
    size: manifest.size,
    sha256: manifest.sha256,
    uploadedAt: dateOrNull(manifest.uploaded_at),
    refusedAt: dateOrNull(manifest.refused_at),
  };
}

function manifestOf(generation: LocalSnapshotGeneration): SnapshotManifest {
  return {
    generation_id: generation.generationId,
    created_at: generation.createdAt.toISOString(),
    last_device_seq: generation.sequences.lastDeviceSeq,
    pull_cursor: generation.sequences.pullCursor,
    key_version: generation.keyVersion,
    size: generation.size,
    sha256: generation.sha256,
    uploaded_at: generation.uploadedAt?.toISOString() ?? null,
    refused_at: generation.refusedAt?.toISOString() ?? null,
  };
}

export async function readGenerations(folder: string): Promise<LocalSnapshotGeneration[]> {
  return (await readManifests(folder)).map(generationOf);
}

async function objectOf(
  folder: string,
  generationId: string,
): Promise<Uint8Array<ArrayBuffer> | undefined> {
  try {
    return new Uint8Array(await readFile(objectPath(folder, generationId)));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

export function folderSnapshotGenerations(
  folder: string,
  durability: Durability = nodeDurability,
): LocalSnapshotGenerations {
  return {
    pendingNewestFirst: async () =>
      pendingSnapshotGenerationsNewestFirst(await readGenerations(folder)),
    objectOf: (generation) => objectOf(folder, generation.generationId),
    markUploaded: (generation, at) =>
      writeManifest(folder, manifestOf({ ...generation, uploadedAt: at }), durability),
    markRefused: (generation, at) =>
      writeManifest(folder, manifestOf({ ...generation, refusedAt: at }), durability),
  };
}

export async function removeGeneration(
  folder: string,
  generationId: string,
  durability: Durability = nodeDurability,
): Promise<void> {
  await rm(manifestPath(folder, generationId), { force: true });
  await durability.folder(folder);
  await rm(objectPath(folder, generationId), { force: true });
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
