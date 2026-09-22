import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { reportEveryConnectionError } from "./pool-connection-error-handler.js";

class FakePool extends EventEmitter {}
class FakeClient extends EventEmitter {}

describe("reportEveryConnectionError", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("registers a connect listener on the pool, the same handler graphile-worker's own assertPool checks for", () => {
    const pool = new FakePool();

    reportEveryConnectionError(pool, "recovery job queue");

    expect(pool.listenerCount("connect")).toBeGreaterThan(0);
  });

  it("attaches an error handler to a connection the pool opens, and reports its error without throwing", () => {
    const pool = new FakePool();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    reportEveryConnectionError(pool, "recovery worker");

    const client = new FakeClient();
    pool.emit("connect", client);
    const error = new Error("connection terminated unexpectedly");

    expect(client.listenerCount("error")).toBeGreaterThan(0);
    expect(() => client.emit("error", error)).not.toThrow();
    expect(consoleError).toHaveBeenCalledWith(
      "recovery worker: active database client failed",
      error,
    );
  });

  it("keeps attaching a handler to every later connection, unlike graphile-worker's own releaser which removes its handlers on release", () => {
    const pool = new FakePool();
    reportEveryConnectionError(pool, "recovery job queue");

    const firstClient = new FakeClient();
    const secondClient = new FakeClient();
    pool.emit("connect", firstClient);
    pool.emit("connect", secondClient);

    expect(firstClient.listenerCount("error")).toBeGreaterThan(0);
    expect(secondClient.listenerCount("error")).toBeGreaterThan(0);
  });
});
