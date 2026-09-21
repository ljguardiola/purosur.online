// On Windows, a utility process's `inherit`-mode stdio does not reach the handle Playwright
// captures from the main process, unlike on Linux; piping the core's stdout/stderr (see the
// `stdio` option passed to `utilityProcess.fork`) and forwarding it here works on both.

import { StringDecoder } from "node:string_decoder";

interface CoreOutputStream {
  on(event: "data", listener: (chunk: Buffer | string) => void): void;
  on(event: "end", listener: () => void): void;
}

export interface CoreProcessOutput {
  stdout: CoreOutputStream | null;
  stderr: CoreOutputStream | null;
}

export interface OutputSink {
  write(chunk: string): unknown;
  on(event: "error", listener: (error: Error) => void): unknown;
}

// A write to a pipe whose reader has gone away fails with EPIPE, reported as an `error` event that
// would otherwise be an uncaught exception in main. With no reader left, the output is dropped.
const guardedSinks = new WeakSet<OutputSink>();

function guardAgainstWriteErrors(sink: OutputSink): void {
  if (guardedSinks.has(sink)) {
    return;
  }
  guardedSinks.add(sink);
  sink.on("error", () => {});
}

function writeOrDrop(sink: OutputSink, text: string): void {
  if (text.length === 0) {
    return;
  }
  try {
    sink.write(text);
  } catch {
    // Same as an `error` event: nowhere left to write to.
  }
}

function forward(stream: CoreOutputStream | null, sink: OutputSink): void {
  if (stream === null) {
    return;
  }
  guardAgainstWriteErrors(sink);
  // A chunk boundary can fall inside a multi-byte UTF-8 character.
  const decoder = new StringDecoder("utf8");
  stream.on("data", (chunk) => {
    writeOrDrop(sink, typeof chunk === "string" ? chunk : decoder.write(chunk));
  });
  stream.on("end", () => {
    writeOrDrop(sink, decoder.end());
  });
}

// Forwards via a plain stream write, never console.*: main's own Sentry console-logging
// integration would otherwise ship the core's already-reported output a second time.
export function forwardCoreOutput(
  process: CoreProcessOutput,
  stdout: OutputSink,
  stderr: OutputSink,
): void {
  forward(process.stdout, stdout);
  forward(process.stderr, stderr);
}
