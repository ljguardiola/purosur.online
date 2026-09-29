import { describe, expect, it } from "vitest";
import type { CorePort } from "./core-client";
import { createCoreClient } from "./core-client";

class FakePort implements CorePort {
  posted: unknown[] = [];
  started = false;
  closed = false;
  private listener: ((event: { data: unknown }) => void) | undefined;

  postMessage(message: unknown): void {
    this.posted.push(message);
  }

  addEventListener(_type: "message", listener: (event: { data: unknown }) => void): void {
    this.listener = listener;
  }

  start(): void {
    this.started = true;
  }

  close(): void {
    this.closed = true;
  }

  answer(data: unknown): void {
    this.listener?.({ data });
  }
}

function clientWithSequentialIds() {
  let next = 0;
  return createCoreClient({ newRequestId: () => `request-${++next}` });
}

describe("createCoreClient", () => {
  it("asks the core whether this installation is enrolled and resolves with its answer", async () => {
    const client = clientWithSequentialIds();
    const port = new FakePort();
    client.connect(port);

    const enrolled = client.enrollmentStatus();
    port.answer({ type: "enrollment-status", request_id: "request-1", enrolled: true });

    expect(await enrolled).toBe(true);
    expect(port.started).toBe(true);
    expect(port.posted).toEqual([{ type: "enrollment-status-request", request_id: "request-1" }]);
  });

  it("asks the core to enroll with the code as typed and resolves with the outcome", async () => {
    const client = clientWithSequentialIds();
    const port = new FakePort();
    client.connect(port);

    const outcome = client.enroll("p4nx 7kwe");
    port.answer({
      type: "enrollment-result",
      request_id: "request-1",
      outcome: { kind: "rate_limited", retry_after_seconds: 60 },
    });

    expect(await outcome).toEqual({ kind: "rate_limited", retry_after_seconds: 60 });
    expect(port.posted).toEqual([{ type: "enroll", request_id: "request-1", code: "p4nx 7kwe" }]);
  });

  it("holds a request made before the core is connected until it is", async () => {
    const client = clientWithSequentialIds();
    const enrolled = client.enrollmentStatus();
    const port = new FakePort();

    client.connect(port);
    port.answer({ type: "enrollment-status", request_id: "request-1", enrolled: false });

    expect(port.posted).toEqual([{ type: "enrollment-status-request", request_id: "request-1" }]);
    expect(await enrolled).toBe(false);
  });

  it("ignores an answer that doesn't follow the contract or answers no request", async () => {
    const client = clientWithSequentialIds();
    const port = new FakePort();
    client.connect(port);

    const enrolled = client.enrollmentStatus();
    port.answer({ type: "enrollment-status", request_id: "request-1", enrolled: "yes" });
    port.answer({ type: "enrollment-status", request_id: "request-9", enrolled: false });
    port.answer({
      type: "enrollment-result",
      request_id: "request-1",
      outcome: { kind: "enrolled" },
    });
    port.answer({ type: "enrollment-status", request_id: "request-1", enrolled: true });

    expect(await enrolled).toBe(true);
  });

  it("fails a request the replaced connection can no longer answer, and closes that port", async () => {
    const client = clientWithSequentialIds();
    const previous = new FakePort();
    client.connect(previous);
    const enrolled = client.enrollmentStatus();

    client.connect(new FakePort());

    await expect(enrolled).rejects.toThrow("the core connection was replaced");
    expect(previous.closed).toBe(true);
  });

  it("ignores anything still arriving on a replaced port", async () => {
    const client = clientWithSequentialIds();
    const previous = new FakePort();
    client.connect(previous);
    const next = new FakePort();
    client.connect(next);

    const enrolled = client.enrollmentStatus();
    previous.answer({ type: "enrollment-status", request_id: "request-1", enrolled: false });
    next.answer({ type: "enrollment-status", request_id: "request-1", enrolled: true });

    expect(await enrolled).toBe(true);
  });
});
