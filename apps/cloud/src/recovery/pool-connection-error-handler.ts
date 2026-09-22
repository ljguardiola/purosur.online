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
 * Reports every database failure a pool can raise, exactly once each.
 *
 * Both listeners are required: graphile-worker's own `assertPool` installs its handlers — and its
 * releaser removes them again when the worker stops — whenever the pool it is given is missing
 * either an `error` or a `connect` listener, and it checks the two independently.
 *
 * pg hands the error of a connection it has already taken back to the pool, so only a checked-out
 * connection is reported here; reporting both would report one dropped connection twice, the
 * first time as an active connection it no longer is.
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
    client.on("error", (error) => {
      if (!checkedOut.has(client)) {
        return;
      }
      reportRecoveryError(`${label}: active database client failed`, error, deps);
    });
  });
}
