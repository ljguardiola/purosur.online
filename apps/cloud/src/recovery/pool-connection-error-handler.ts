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

// graphile-worker's assertPool requires the pool to keep its own error and connect listeners
// populated; pg also re-emits a taken-back connection's error on the pool, so only checked-out
// connections are reported here.
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
    // pg raises a killed backend's error twice (the fatal message, then the closing socket);
    // only the first is new.
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
