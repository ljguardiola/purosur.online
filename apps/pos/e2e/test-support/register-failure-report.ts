interface ReportedTask {
  readonly result?: { readonly state?: string; readonly errors?: readonly unknown[] };
  readonly tasks?: readonly ReportedTask[];
}

function failed(task: ReportedTask): boolean {
  return (
    task.result?.state === "fail" ||
    (task.result?.errors?.length ?? 0) > 0 ||
    (task.tasks ?? []).some(failed)
  );
}

export function failureReport(
  file: ReportedTask,
  registers: readonly (readonly string[])[],
): string | undefined {
  if (registers.length === 0 || !failed(file)) {
    return undefined;
  }
  return registers
    .map((logs, index) =>
      logs.length === 0
        ? `register ${index + 1} logged nothing`
        : `register ${index + 1} logged:\n${logs.join("")}`,
    )
    .join("\n\n");
}
