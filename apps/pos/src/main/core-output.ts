// On Windows, a utility process's `inherit`-mode stdio does not reach the handle Playwright
// captures from the main process, unlike on Linux; piping the core's stdout/stderr (see the
// `stdio` option passed to `utilityProcess.fork`) and forwarding it here works on both.

export interface CoreProcessOutput {
  stdout: { on(event: "data", listener: (chunk: Buffer | string) => void): void } | null;
  stderr: { on(event: "data", listener: (chunk: Buffer | string) => void): void } | null;
}

export interface OutputSink {
  write(chunk: string): void;
}

// Forwards via a plain stream write, never console.*: main's own Sentry console-logging
// integration would otherwise ship the core's already-reported output a second time.
export function forwardCoreOutput(
  process: CoreProcessOutput,
  stdout: OutputSink,
  stderr: OutputSink,
): void {
  process.stdout?.on("data", (chunk) => stdout.write(chunk.toString()));
  process.stderr?.on("data", (chunk) => stderr.write(chunk.toString()));
}
