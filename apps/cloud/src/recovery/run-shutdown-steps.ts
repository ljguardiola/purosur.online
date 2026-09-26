export interface ShutdownStep {
  /** Identifies the step in a failure's message, e.g. "recovery worker". */
  readonly label: string;
  readonly run: () => Promise<void>;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Runs every step regardless of an earlier failure, so a later step that depends on an earlier
 * one's cleanup having been attempted still gets its turn. */
export async function runShutdownSteps(steps: readonly ShutdownStep[]): Promise<void> {
  const failures: Error[] = [];
  for (const { label, run } of steps) {
    try {
      await run();
    } catch (error) {
      failures.push(
        new Error(`${label} failed to shut down: ${describeError(error)}`, { cause: error }),
      );
    }
  }
  if (failures.length === 1) {
    throw failures[0];
  }
  if (failures.length > 1) {
    throw new AggregateError(failures, `${failures.length} shutdown steps failed`);
  }
}
