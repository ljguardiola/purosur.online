import Fastify, { type FastifyInstance } from "fastify";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { registerSnapshotGenerations } from "../../platform/db/schema.js";
import {
  BACKOFFICE_ORIGIN,
  type BackofficeSession,
  openBackofficeSession,
  SESSION_NOON,
} from "../../test-support/backoffice-session.js";
import { TEST_INSTALLATION_KEYS_ENCRYPTION_KEY } from "../../test-support/installation-keys-encryption-key.js";
import { seededLocationId } from "../../test-support/seeded-location.js";
import { registerSnapshotBackupsRoutes } from "../snapshot-backups-routes.js";
import { insertEnrolledInstallation } from "./enrolled-installation.js";
import { keyStore } from "./key-store.js";

export const BACKUPS_PERMISSION = "view_backups_and_rotate_key";

export function buildBackupsApp<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
): FastifyInstance {
  const app = Fastify();
  registerSnapshotBackupsRoutes(app, {
    db,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    keysEncryptionKey: TEST_INSTALLATION_KEYS_ENCRYPTION_KEY,
    now: () => SESSION_NOON,
  });
  return app;
}

export async function backupsSession<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  options: { permissionKeys?: string[]; passkeyAuthorized?: boolean } = {},
): Promise<BackofficeSession> {
  return openBackofficeSession(db, {
    now: SESSION_NOON,
    locationId: await seededLocationId(db),
    permissionKeys: options.permissionKeys ?? [BACKUPS_PERMISSION],
    passkeyAuthorized: options.passkeyAuthorized ?? true,
  });
}

export interface BackedUpRegister {
  registerId: string;
  deviceId: string;
}

export async function insertRegisterWithKeys<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  options: { name: string; keyVersions: number[] },
): Promise<BackedUpRegister> {
  const installation = await insertEnrolledInstallation(db, {
    now: SESSION_NOON,
    registerName: options.name,
  });
  await keyStore(db).transaction(async (tx) => {
    for (const version of options.keyVersions) {
      await tx.recordSnapshotKey(installation.registerId, {
        version,
        key: `fictional-key-${version}`,
      });
    }
  });
  return { registerId: installation.registerId, deviceId: installation.deviceId };
}

export async function insertGeneration<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  register: BackedUpRegister,
  options: {
    id: string;
    createdAt: Date;
    status?: "declared" | "uploaded" | "verified" | "failed";
    failureReason?: "never_uploaded" | "size_mismatch" | "hash_mismatch";
    keyVersion?: number;
    pruned?: boolean;
    size?: number;
  },
): Promise<void> {
  await db.insert(registerSnapshotGenerations).values({
    id: options.id,
    registerId: register.registerId,
    deviceId: register.deviceId,
    createdAt: options.createdAt,
    size: options.size ?? 2048,
    sha256: "a".repeat(64),
    keyVersion: options.keyVersion ?? 1,
    status: options.status ?? "verified",
    failureReason: options.failureReason ?? null,
    pruned: options.pruned ?? false,
  });
}
