export interface ShutdownStep {
  /** Identifies the step in a failure's message, e.g. "recovery worker". */
  readonly label: string;
  run(): Promise<void>;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Runs every step in order, regardless of whether an earlier one failed, so a later step that
 * depends on an earlier one's cleanup having been attempted (e.g. ending a pool the utilities
 * ahead of it were using) still gets its turn. Rejects once every step has run: with the single
 * labelled failure when exactly one step failed, or an `AggregateError` listing every labelled
 * failure otherwise.
 */
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
