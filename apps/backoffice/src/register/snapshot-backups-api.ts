import {
  type SnapshotBackups as SnapshotBackupsBody,
  type SnapshotLifecycleRulesBody,
  snapshotBackupRegistersSchema,
  snapshotBackupsSchema,
  snapshotKeyRotationSchema,
  snapshotLifecycleRulesSchema,
} from "@purosur/contracts";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { rateLimitOutcome } from "../platform/rate-limit-outcome";
import { readValidationFailedField } from "../platform/validation-failed-field";

export type SnapshotBackupRegister = { id: string; name: string };

export type SnapshotLifecycleRules = SnapshotLifecycleRulesBody;

export type SnapshotBackupGeneration = {
  id: string;
  createdAt: string;
  size: number;
  status: SnapshotBackupsBody["generations"][number]["status"];
  countsForRestore: boolean;
  location: SnapshotBackupsBody["generations"][number]["location"];
};

export type SnapshotBackups = {
  rules: SnapshotLifecycleRules;
  tiers: SnapshotBackupsBody["tiers"];
  recentLimit: number;
  generations: SnapshotBackupGeneration[];
};

export type FetchSnapshotBackupRegistersOutcome = CloudReadOutcome<SnapshotBackupRegister[]>;

export type FetchSnapshotBackupsOutcome = CloudReadOutcome<SnapshotBackups>;

type GatedFailure =
  | { kind: "unauthenticated" }
  | { kind: "authorization_required" }
  | { kind: "forbidden" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

export type ChangeSnapshotLifecycleRulesOutcome =
  | { kind: "ok"; value: SnapshotLifecycleRules }
  | { kind: "validation_failed"; field: string }
  | GatedFailure;

export type RotateSnapshotKeyOutcome =
  | { kind: "ok"; value: { keyVersion: number } }
  | { kind: "not_found" }
  | { kind: "no_key_yet" }
  | GatedFailure;

async function readCloud<T>(
  path: string,
  fromBody: (body: unknown) => T | undefined,
): Promise<CloudReadOutcome<T>> {
  let response: Response;
  try {
    response = await fetch(path);
  } catch {
    return { kind: "failed" };
  }
  if (response.status === 401) {
    return { kind: "unauthenticated" };
  }
  if (response.status === 403) {
    return { kind: "forbidden" };
  }
  if (response.status === 429) {
    return rateLimitOutcome(response);
  }
  if (!response.ok) {
    return { kind: "failed" };
  }
  const value = fromBody(await response.json().catch(() => undefined));
  return value === undefined ? { kind: "failed" } : { kind: "ok", value };
}

async function send(
  method: "POST" | "PUT",
  path: string,
  body: unknown,
): Promise<Response | undefined> {
  try {
    return await fetch(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return undefined;
  }
}

async function errorCodeOf(response: Response): Promise<string | undefined> {
  const body = (await response.json().catch(() => undefined)) as { code?: unknown } | undefined;
  return typeof body?.code === "string" ? body.code : undefined;
}

async function gatedFailureOf(response: Response): Promise<GatedFailure> {
  if (response.status === 401) {
    return (await errorCodeOf(response)) === "authorization_required"
      ? { kind: "authorization_required" }
      : { kind: "unauthenticated" };
  }
  if (response.status === 403) {
    return { kind: "forbidden" };
  }
  if (response.status === 429) {
    return rateLimitOutcome(response);
  }
  return { kind: "failed" };
}

export function fetchSnapshotBackupRegisters(): Promise<FetchSnapshotBackupRegistersOutcome> {
  return readCloud(
    "/api/snapshot-backups/registers",
    (body) => snapshotBackupRegistersSchema.safeParse(body).data?.registers,
  );
}

export function fetchSnapshotBackups(registerId: string): Promise<FetchSnapshotBackupsOutcome> {
  return readCloud(`/api/snapshot-backups/registers/${registerId}`, (body) => {
    const backups = snapshotBackupsSchema.safeParse(body).data;
    return (
      backups && {
        rules: backups.rules,
        tiers: backups.tiers,
        recentLimit: backups.recent_limit,
        generations: backups.generations.map((generation) => ({
          id: generation.id,
          createdAt: generation.created_at,
          size: generation.size,
          status: generation.status,
          countsForRestore: generation.counts_for_restore,
          location: generation.location,
        })),
      }
    );
  });
}

export async function changeSnapshotLifecycleRules(
  rules: SnapshotLifecycleRules,
): Promise<ChangeSnapshotLifecycleRulesOutcome> {
  const response = await send("PUT", "/api/snapshot-backups/lifecycle-rules", rules);
  if (response === undefined) {
    return { kind: "failed" };
  }
  if (response.ok) {
    const parsed = snapshotLifecycleRulesSchema.safeParse(
      await response.json().catch(() => undefined),
    );
    return parsed.success ? { kind: "ok", value: parsed.data } : { kind: "failed" };
  }
  if (response.status === 400) {
    const field = await readValidationFailedField(response);
    return field === undefined ? { kind: "failed" } : { kind: "validation_failed", field };
  }
  return gatedFailureOf(response);
}

export async function rotateSnapshotKey(registerId: string): Promise<RotateSnapshotKeyOutcome> {
  const response = await send(
    "POST",
    `/api/snapshot-backups/registers/${registerId}/key-rotations`,
    {},
  );
  if (response === undefined) {
    return { kind: "failed" };
  }
  if (response.ok) {
    const parsed = snapshotKeyRotationSchema.safeParse(
      await response.json().catch(() => undefined),
    );
    return parsed.success
      ? { kind: "ok", value: { keyVersion: parsed.data.key_version } }
      : { kind: "failed" };
  }
  if (response.status === 404) {
    return { kind: "not_found" };
  }
  if (response.status === 409) {
    return (await errorCodeOf(response)) === "no_key_yet"
      ? { kind: "no_key_yet" }
      : { kind: "failed" };
  }
  return gatedFailureOf(response);
}
