import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { reportPoolErrors } from "./pool-connection-error-handler.js";

class FakePool extends EventEmitter {}
class FakeClient extends EventEmitter {}

/** Mirrors how pg hands a client out and takes it back, around which this reporting turns. */
function checkOut(pool: FakePool, client: FakeClient): void {
  pool.emit("connect", client);
  pool.emit("acquire", client);
}

function release(pool: FakePool, client: FakeClient): void {
  pool.emit("release", undefined, client);
}

describe("reportPoolErrors", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps both an error and a connect listener on the pool, the two graphile-worker's own assertPool checks for", () => {
    const pool = new FakePool();

    reportPoolErrors(pool, "recovery job queue");

    expect(pool.listenerCount("error")).toBeGreaterThan(0);
    expect(pool.listenerCount("connect")).toBeGreaterThan(0);
  });

  it("reports a pool error as an idle client failure, to the console and to Sentry", () => {
    const pool = new FakePool();
    const captureException = vi.fn();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    reportPoolErrors(pool, "recovery job queue", { captureException });
    const error = new Error("connection terminated unexpectedly");

    expect(() => pool.emit("error", error)).not.toThrow();

    expect(consoleError).toHaveBeenCalledExactlyOnceWith(
      "recovery job queue: idle database client failed",
      error,
    );
    expect(captureException).toHaveBeenCalledExactlyOnceWith(error);
  });

  it("reports a checked-out connection's error as an active client failure, to the console and to Sentry", () => {
    const pool = new FakePool();
    const captureException = vi.fn();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    reportPoolErrors(pool, "recovery worker", { captureException });

    const client = new FakeClient();
    checkOut(pool, client);
    const error = new Error("connection terminated unexpectedly");

    expect(client.listenerCount("error")).toBeGreaterThan(0);
    expect(() => client.emit("error", error)).not.toThrow();
    expect(consoleError).toHaveBeenCalledExactlyOnceWith(
      "recovery worker: active database client failed",
      error,
    );
    expect(captureException).toHaveBeenCalledExactlyOnceWith(error);
  });

  it("reports a dropped connection the pool already took back exactly once, as the idle failure it is", () => {
    const pool = new FakePool();
    const captureException = vi.fn();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    reportPoolErrors(pool, "recovery worker", { captureException });

    const client = new FakeClient();
    checkOut(pool, client);
    release(pool, client);
    const error = new Error("connection terminated unexpectedly");

    // pg reattaches its own idle listener on release, and that listener republishes the error on
    // the pool, so both of these fire for one dropped connection.
    expect(() => client.emit("error", error)).not.toThrow();
    pool.emit("error", error);

    expect(consoleError).toHaveBeenCalledExactlyOnceWith(
      "recovery worker: idle database client failed",
      error,
    );
    expect(captureException).toHaveBeenCalledExactlyOnceWith(error);
  });

  it("reports a connection checked out again after its release as an active client failure", () => {
    const pool = new FakePool();
    const captureException = vi.fn();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    reportPoolErrors(pool, "recovery worker", { captureException });

    const client = new FakeClient();
    checkOut(pool, client);
    release(pool, client);
    pool.emit("acquire", client);
    const error = new Error("connection terminated unexpectedly");

    client.emit("error", error);

    expect(consoleError).toHaveBeenCalledExactlyOnceWith(
      "recovery worker: active database client failed",
      error,
    );
  });

  it("keeps attaching a handler to every later connection, unlike graphile-worker's own releaser which removes its handlers on release", () => {
    const pool = new FakePool();
    reportPoolErrors(pool, "recovery job queue");

    const firstClient = new FakeClient();
    const secondClient = new FakeClient();
    pool.emit("connect", firstClient);
    pool.emit("connect", secondClient);

    expect(firstClient.listenerCount("error")).toBeGreaterThan(0);
    expect(secondClient.listenerCount("error")).toBeGreaterThan(0);
  });
});
