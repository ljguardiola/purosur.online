import { PassThrough, Writable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { forwardCoreOutput } from "./core-output";

const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

function fakeReadable() {
  const stream = new PassThrough();
  return {
    on: stream.on.bind(stream),
    async emit(chunk: Buffer | string): Promise<void> {
      stream.write(chunk);
      await settle();
    },
    async end(): Promise<void> {
      stream.end();
      await settle();
    },
  };
}

function fakeSink() {
  return { write: vi.fn(), on: vi.fn() };
}

function written(sink: { write: ReturnType<typeof vi.fn> }): string {
  return sink.write.mock.calls.map(([chunk]) => chunk).join("");
}

function brokenPipe(): Writable {
  return new Writable({
    write(_chunk, _encoding, callback) {
      callback(Object.assign(new Error("write EPIPE"), { code: "EPIPE" }));
    },
  });
}

describe("forwardCoreOutput", () => {
  it("writes every stdout chunk to the given stdout sink", async () => {
    const stdout = fakeReadable();
    const stderr = fakeReadable();
    const stdoutSink = fakeSink();
    const stderrSink = fakeSink();

    forwardCoreOutput({ stdout, stderr }, stdoutSink, stderrSink);
    await stdout.emit(Buffer.from("core: rejected message"));

    expect(written(stdoutSink)).toBe("core: rejected message");
    expect(stderrSink.write).not.toHaveBeenCalled();
  });

  it("writes every stderr chunk to the given stderr sink", async () => {
    const stdout = fakeReadable();
    const stderr = fakeReadable();
    const stdoutSink = fakeSink();
    const stderrSink = fakeSink();

    forwardCoreOutput({ stdout, stderr }, stdoutSink, stderrSink);
    await stderr.emit(Buffer.from("core: crashed"));

    expect(written(stderrSink)).toBe("core: crashed");
    expect(stdoutSink.write).not.toHaveBeenCalled();
  });

  it("never splits a multi-byte character that arrives across two chunks", async () => {
    const stdout = fakeReadable();
    const stdoutSink = fakeSink();
    const bytes = Buffer.from("año ✓", "utf8");
    const splitInsideEnye = 2;
    const splitInsideCheckMark = bytes.length - 1;

    forwardCoreOutput({ stdout, stderr: null }, stdoutSink, fakeSink());
    await stdout.emit(bytes.subarray(0, splitInsideEnye));
    await stdout.emit(bytes.subarray(splitInsideEnye, splitInsideCheckMark));
    await stdout.emit(bytes.subarray(splitInsideCheckMark));

    expect(written(stdoutSink)).toBe("año ✓");
  });

  it("writes out an incomplete character left when the stream ends", async () => {
    const stdout = fakeReadable();
    const stdoutSink = fakeSink();

    forwardCoreOutput({ stdout, stderr: null }, stdoutSink, fakeSink());
    await stdout.emit(Buffer.from([0x61, 0xc3]));
    await stdout.end();

    expect(written(stdoutSink)).toBe("a�");
  });

  it("drops output main can no longer write, instead of crashing main", async () => {
    const stdout = fakeReadable();
    const stderr = fakeReadable();

    forwardCoreOutput({ stdout, stderr }, brokenPipe(), brokenPipe());
    await stdout.emit("core: still running");
    await stderr.emit("core: still running");
    await stdout.emit("core: still running after the pipe closed");
    await settle();
  });

  it("drops output when writing throws right away", async () => {
    const stdout = fakeReadable();
    const stdoutSink = {
      write: vi.fn(() => {
        throw new Error("write EPIPE");
      }),
      on: vi.fn(),
    };

    forwardCoreOutput({ stdout, stderr: null }, stdoutSink, fakeSink());
    await stdout.emit("core: still running");
    await stdout.emit("core: still running after the pipe closed");

    expect(stdoutSink.write).toHaveBeenCalledTimes(2);
  });

  it("guards each sink against write errors only once, however many times the core restarts", () => {
    const stdoutSink = fakeSink();
    const stderrSink = fakeSink();

    for (let restart = 0; restart < 20; restart += 1) {
      forwardCoreOutput({ stdout: fakeReadable(), stderr: fakeReadable() }, stdoutSink, stderrSink);
    }

    expect(stdoutSink.on).toHaveBeenCalledTimes(1);
    expect(stderrSink.on).toHaveBeenCalledTimes(1);
  });

  it("does nothing for a stream the child was not piped with", () => {
    expect(() =>
      forwardCoreOutput({ stdout: null, stderr: null }, fakeSink(), fakeSink()),
    ).not.toThrow();
  });
});
