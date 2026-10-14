import { SNAPSHOT_RETENTION_INTERVAL_MS, SNAPSHOT_VERIFICATION_INTERVAL_MS } from "@purosur/domain";
import {
  applySnapshotRetention,
  type SnapshotObjects,
  verifySnapshotGenerations,
} from "@purosur/domain/register/use-cases";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { PoolClient } from "pg";
import {
  type BackgroundJobs,
  crontabLineEvery,
  databaseOfClient,
} from "../platform/background-jobs.js";
import { DrizzleRegisterSnapshotLanes, DrizzleSnapshotStore } from "./drizzle-snapshot-store.js";

export const REGISTER_SNAPSHOT_VERIFICATION_TASK_IDENTIFIER = "register-snapshot-verification";
export const REGISTER_SNAPSHOT_RETENTION_TASK_IDENTIFIER = "register-snapshot-retention";

interface RegisterSnapshotTaskDeps {
  now: () => Date;
  objects: SnapshotObjects;
}

export async function verifyRegisterSnapshotsTask<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  deps: RegisterSnapshotTaskDeps,
): Promise<void> {
  await verifySnapshotGenerations({
    store: new DrizzleSnapshotStore(db),
    clock: { now: deps.now },
    objects: deps.objects,
  });
}

export async function applyRegisterSnapshotRetentionTask<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  deps: RegisterSnapshotTaskDeps,
): Promise<void> {
  await applySnapshotRetention({
    store: new DrizzleSnapshotStore(db),
    lanes: new DrizzleRegisterSnapshotLanes({ withConnection: (work) => work(db) }),
    clock: { now: deps.now },
    objects: deps.objects,
  });
}

export interface RegisterSnapshotJobsDeps {
  createDatabase?: (client: PoolClient) => NodePgDatabase<Record<string, never>>;
  verify?: typeof verifyRegisterSnapshotsTask;
  retain?: typeof applyRegisterSnapshotRetentionTask;
}

export function registerSnapshotJobs(
  options: RegisterSnapshotTaskDeps,
  deps: RegisterSnapshotJobsDeps = {},
): BackgroundJobs {
  const doCreateDatabase = deps.createDatabase ?? databaseOfClient;
  const doVerify = deps.verify ?? verifyRegisterSnapshotsTask;
  const doRetain = deps.retain ?? applyRegisterSnapshotRetentionTask;
  return {
    taskList: {
      [REGISTER_SNAPSHOT_VERIFICATION_TASK_IDENTIFIER]: async (_payload, helpers) => {
        await helpers.withPgClient((client) => doVerify(doCreateDatabase(client), options));
      },
      [REGISTER_SNAPSHOT_RETENTION_TASK_IDENTIFIER]: async (_payload, helpers) => {
        await helpers.withPgClient((client) => doRetain(doCreateDatabase(client), options));
      },
    },
    crontab: [
      crontabLineEvery(
        SNAPSHOT_VERIFICATION_INTERVAL_MS,
        REGISTER_SNAPSHOT_VERIFICATION_TASK_IDENTIFIER,
      ),
      crontabLineEvery(SNAPSHOT_RETENTION_INTERVAL_MS, REGISTER_SNAPSHOT_RETENTION_TASK_IDENTIFIER),
    ],
  };
}
