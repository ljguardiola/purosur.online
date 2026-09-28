export interface ShutdownStep {
  readonly label: string;
  readonly run: () => Promise<void>;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

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
