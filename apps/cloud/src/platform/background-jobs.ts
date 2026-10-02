import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import type { TaskList } from "graphile-worker";
import type { PoolClient } from "pg";

export interface BackgroundJobs {
  taskList: TaskList;
  crontab: readonly string[];
}

export function databaseOfClient(client: PoolClient): NodePgDatabase<Record<string, never>> {
  return drizzle(client);
}
