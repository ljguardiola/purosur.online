import type postgres from "postgres";

// A write queued behind another write waits on that write's tuple lock, not on the holder, so
// pg_blocking_pids of the holder never lists it; counting the database's lock waiters does.
export async function countLockWaiters(sql: postgres.Sql): Promise<number> {
  const [row] = await sql<{ waiting: number }[]>`
    select count(*)::int as waiting from pg_stat_activity
    where datname = current_database() and wait_event_type = 'Lock'`;
  return row?.waiting ?? 0;
}

// Bounded only by the calling test's own timeout: how long the queries take to get in line depends
// on the work they do first.
export async function waitForLockWaiters(sql: postgres.Sql, count: number): Promise<void> {
  while ((await countLockWaiters(sql)) < count) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

// Postgres grants waiters on the same lock in the order they queued. Both are settled even when
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
  let settled: Promise<unknown> = Promise.resolve();
  try {
    await holder`begin`;
    await holdLock(holder);
    firstOutcome = first();
    settled = Promise.allSettled([firstOutcome]);
    await waitForLockWaiters(sql, 1);
    secondOutcome = second();
    settled = Promise.allSettled([firstOutcome, secondOutcome]);
    await waitForLockWaiters(sql, 2);
  } finally {
    await holder`rollback`;
    holder.release();
    await settled;
  }
  return Promise.all([firstOutcome, secondOutcome]);
}
