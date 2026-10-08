import {
  type AddJobFunction,
  type Job,
  type JobHelpers,
  Logger,
  type WithPgClient,
} from "graphile-worker";
import pg, { type PoolClient } from "pg";
import { vi } from "vitest";

function buildPoolClient(): PoolClient {
  return Object.assign(new pg.Client(), { release: () => {} });
}

function buildJob(): Job {
  const at = new Date("2026-01-01T00:00:00.000Z");
  return {
    id: "1",
    job_queue_id: null,
    task_id: 1,
    task_identifier: "test-task",
    payload: {},
    priority: 0,
    run_at: at,
    attempts: 1,
    max_attempts: 25,
    last_error: null,
    created_at: at,
    updated_at: at,
    key: null,
    revision: 0,
    locked_at: at,
    locked_by: "test-worker",
    flags: null,
    is_available: false,
  };
}

export function buildJobHelpers() {
  const client = buildPoolClient();
  const borrowClient = vi.fn<(borrowed: PoolClient) => void>();
  const withPgClient: WithPgClient = async (callback) => {
    borrowClient(client);
    return callback(client);
  };
  const addJob = vi.fn<AddJobFunction>(async () => buildJob());
  const helpers: JobHelpers = {
    logger: new Logger(() => () => {}),
    job: buildJob(),
    withPgClient,
    addJob,
    addJobs: async () => [],
    getQueueName: async () => null,
    query: async () => ({ command: "SELECT", rowCount: 0, oid: 0, rows: [], fields: [] }),
    abortSignal: new AbortController().signal,
    abortPromise: new Promise<void>(() => {}),
  };
  return { helpers, borrowClient, addJob, client };
}
