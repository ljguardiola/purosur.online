import { describe, expect, it, vi } from "vitest";
import { forwardCoreOutput } from "./core-output";

type DataListener = (chunk: Buffer | string) => void;

function fakeReadable() {
  const listeners: DataListener[] = [];
  return {
    on(event: "data", listener: DataListener): void {
      expect(event).toBe("data");
      listeners.push(listener);
    },
    emit(chunk: Buffer | string): void {
      for (const listener of listeners) {
        listener(chunk);
      }
    },
  };
}

describe("forwardCoreOutput", () => {
  it("writes every stdout chunk to the given stdout sink", () => {
    const stdout = fakeReadable();
    const stderr = fakeReadable();
    const stdoutSink = { write: vi.fn() };
    const stderrSink = { write: vi.fn() };

    forwardCoreOutput({ stdout, stderr }, stdoutSink, stderrSink);
    stdout.emit(Buffer.from("core: rejected message"));

    expect(stdoutSink.write).toHaveBeenCalledWith("core: rejected message");
    expect(stderrSink.write).not.toHaveBeenCalled();
  });

  it("writes every stderr chunk to the given stderr sink", () => {
    const stdout = fakeReadable();
    const stderr = fakeReadable();
    const stdoutSink = { write: vi.fn() };
    const stderrSink = { write: vi.fn() };

    forwardCoreOutput({ stdout, stderr }, stdoutSink, stderrSink);
    stderr.emit(Buffer.from("core: crashed"));

    expect(stderrSink.write).toHaveBeenCalledWith("core: crashed");
    expect(stdoutSink.write).not.toHaveBeenCalled();
  });

  it("does nothing for a stream the child was not piped with", () => {
    const stdoutSink = { write: vi.fn() };
    const stderrSink = { write: vi.fn() };

    expect(() =>
      forwardCoreOutput({ stdout: null, stderr: null }, stdoutSink, stderrSink),
    ).not.toThrow();
  });
});
