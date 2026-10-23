import pg from "pg";
import postgres from "postgres";

export const DROPPED_CONNECTION = "Connection terminated unexpectedly";
export const COMPLETED_JOB_DELETE = /delete from\s+\S*_private_jobs/;

export interface JobLock {
  attempts: number;
  lockedAt: Date | null;
}

export function poolDroppingTheConnectionOnceOn(connectionString: string, statement: RegExp) {
  const pool = new pg.Pool({ connectionString });
  let dropped = 0;
  pool.on("connect", (client) => {
    const query = client.query.bind(client);
    const dropOnStatement = (config: unknown, ...rest: unknown[]) => {
      const text = typeof config === "string" ? config : (config as { text?: unknown })?.text;
      if (dropped === 0 && typeof text === "string" && statement.test(text)) {
        dropped += 1;
        return Promise.reject(new Error(DROPPED_CONNECTION));
      }
      return (query as (...args: unknown[]) => unknown)(config, ...rest);
    };
    client.query = dropOnStatement as typeof client.query;
  });
  return { pool, droppedQueries: () => dropped };
}

export async function jobLock(
  adminDatabaseUrl: string,
  jobId: string,
): Promise<JobLock | undefined> {
  const sql = postgres(adminDatabaseUrl, { max: 1 });
  try {
    const rows = await sql<JobLock[]>`
      select attempts, locked_at as "lockedAt"
      from graphile_worker._private_jobs
      where id = ${jobId}
    `;
    return rows[0];
  } finally {
    await sql.end({ timeout: 1 });
  }
}

export async function expireJobLock(adminDatabaseUrl: string, jobId: string): Promise<void> {
  const sql = postgres(adminDatabaseUrl, { max: 1 });
  try {
    await sql`
      update graphile_worker._private_jobs
      set locked_at = locked_at - interval '4 hours 1 minute'
      where id = ${jobId}
    `;
  } finally {
    await sql.end({ timeout: 1 });
  }
}
