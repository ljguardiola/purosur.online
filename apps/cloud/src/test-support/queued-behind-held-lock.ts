import type postgres from "postgres";

// A write queued behind another write waits on that write's tuple lock, not on the holder, so
// pg_blocking_pids of the holder never lists it; counting the database's lock waiters does.
export async function waitForLockWaiters(sql: postgres.Sql, count: number): Promise<void> {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const [row] = await sql<{ waiting: number }[]>`
      select count(*)::int as waiting from pg_stat_activity
      where datname = current_database() and wait_event_type = 'Lock'`;
    if ((row?.waiting ?? 0) >= count) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`test setup: ${count} queries never queued behind the held lock`);
}

// Postgres grants waiters on the same row lock in the order they queued. Both are settled even when
// one never queues, so no leftover waiter inflates the next test's count.
export async function runQueuedBehindHeldLock<First, Second>(
  sql: postgres.Sql,
  holdLock: (holder: postgres.ReservedSql) => Promise<unknown>,
  first: () => Promise<First>,
  second: () => Promise<Second>,
): Promise<[First, Second]> {
  const holder = await sql.reserve();
  let firstOutcome: Promise<First> | undefined;
  let secondOutcome: Promise<Second> | undefined;
  try {
    await holder`begin`;
    await holdLock(holder);
    firstOutcome = first();
    await waitForLockWaiters(sql, 1);
    secondOutcome = second();
    await waitForLockWaiters(sql, 2);
  } finally {
    await holder`rollback`;
    holder.release();
    await Promise.allSettled([firstOutcome, secondOutcome]);
  }
  return Promise.all([firstOutcome, secondOutcome]);
}
