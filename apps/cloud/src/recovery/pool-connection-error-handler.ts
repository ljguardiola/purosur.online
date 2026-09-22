interface ConnectionEmitter {
  on(event: "error", listener: (error: Error) => void): unknown;
}

interface ConnectingPool {
  on(event: "connect", listener: (client: ConnectionEmitter) => void): unknown;
}

/**
 * Attaches an error handler to every connection a pool opens. Owning this ourselves keeps
 * graphile-worker's own `assertPool` from installing (and later removing) its per-connection
 * handlers: it only does that when `pgPool.listeners("connect").length === 0`
 * (apps/cloud/node_modules/graphile-worker/dist/lib.js:202-204), and its releaser then removes
 * both handlers again once the worker is released (lib.js:266-270) — the same teardown order that
 * once turned a dropped connection into an unhandled error and failed a CI run.
 */
export function reportEveryConnectionError(pool: ConnectingPool, label: string): void {
  pool.on("connect", (client) => {
    client.on("error", (error) => {
      console.error(`${label}: active database client failed`, error);
    });
  });
}
