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

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

export function crontabLineEvery(intervalMs: number, taskIdentifier: string): string {
  if (
    intervalMs > 0 &&
    intervalMs < HOUR_MS &&
    HOUR_MS % intervalMs === 0 &&
    intervalMs % MINUTE_MS === 0
  ) {
    const minutes = intervalMs / MINUTE_MS;
    return `${minutes === 1 ? "*" : `*/${minutes}`} * * * * ${taskIdentifier}`;
  }
  const day = 24 * HOUR_MS;
  if (
    intervalMs >= HOUR_MS &&
    intervalMs <= day &&
    day % intervalMs === 0 &&
    intervalMs % HOUR_MS === 0
  ) {
    const hours = intervalMs / HOUR_MS;
    return `0 ${hours === 24 ? "0" : hours === 1 ? "*" : `*/${hours}`} * * * ${taskIdentifier}`;
  }
  throw new RangeError(
    `A crontab line cannot repeat every ${intervalMs} ms evenly: it needs whole minutes dividing an hour or whole hours dividing a day.`,
  );
}
