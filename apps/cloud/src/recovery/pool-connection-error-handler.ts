import { type ReportRecoveryErrorDeps, reportRecoveryError } from "./recovery-error-reporting.js";

interface PoolConnection {
  on(event: "error", listener: (error: Error) => void): unknown;
}

interface ReportingPool {
  on(event: "error", listener: (error: Error) => void): unknown;
  on(event: "connect" | "acquire", listener: (client: PoolConnection) => void): unknown;
  on(
    event: "release",
    listener: (error: Error | undefined, client: PoolConnection) => void,
  ): unknown;
}

/**
 * graphile-worker's `assertPool` installs its own handlers whenever the pool is missing an
 * `error` or `connect` listener (checked independently), so both are kept populated here. pg
 * hands a taken-back connection's error to the pool too, so only checked-out connections are
 * reported to avoid double-reporting one drop.
 */
export function reportPoolErrors(
  pool: ReportingPool,
  label: string,
  deps: ReportRecoveryErrorDeps = {},
): void {
  const checkedOut = new WeakSet<PoolConnection>();

  pool.on("error", (error) => {
    reportRecoveryError(`${label}: idle database client failed`, error, deps);
  });
  pool.on("acquire", (client) => {
    checkedOut.add(client);
  });
  pool.on("release", (_error, client) => {
    checkedOut.delete(client);
  });
  pool.on("connect", (client) => {
    // pg raises one killed backend twice on the same connection: the fatal message, then the
    // socket closing under it. Only the first says anything new.
    let reported = false;

    client.on("error", (error) => {
      if (reported || !checkedOut.has(client)) {
        return;
      }
      reported = true;
      reportRecoveryError(`${label}: active database client failed`, error, deps);
    });
  });
}
