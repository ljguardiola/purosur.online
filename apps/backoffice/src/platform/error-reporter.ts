import type { ErrorReportingConfiguration } from "@purosur/contracts";

type EnabledConfiguration = Extract<ErrorReportingConfiguration, { enabled: true }>;

export interface ErrorReporterDependencies {
  target: Pick<EventTarget, "addEventListener" | "removeEventListener">;
  fetchConfiguration(): Promise<ErrorReportingConfiguration>;
  startSending(configuration: EnabledConfiguration): Promise<(error: unknown) => void>;
}

export interface ErrorReporter {
  report(error: unknown): void;
  settled: Promise<void>;
}

// Once the reporting library starts it installs its own handlers for these, so ours only cover
// the time before it has loaded.
function keepWindowErrors(
  target: ErrorReporterDependencies["target"],
  keep: (error: unknown) => void,
): () => void {
  const onError = (event: Event) => {
    const { error, message } = event as Event & { error?: unknown; message?: string };
    if (error != null) {
      keep(error);
    } else if (message) {
      keep(new Error(message));
    }
  };
  const onRejection = (event: Event) => keep((event as Event & { reason?: unknown }).reason);
  target.addEventListener("error", onError);
  target.addEventListener("unhandledrejection", onRejection);
  return () => {
    target.removeEventListener("error", onError);
    target.removeEventListener("unhandledrejection", onRejection);
  };
}

export function startErrorReporting(deps: ErrorReporterDependencies): ErrorReporter {
  let kept: unknown[] | undefined = [];
  let send: ((error: unknown) => void) | undefined;

  const report = (error: unknown) => {
    if (send) {
      send(error);
    } else {
      kept?.push(error);
    }
  };
  const stopKeepingWindowErrors = keepWindowErrors(deps.target, report);

  async function settle(): Promise<void> {
    try {
      const configuration = await deps.fetchConfiguration();
      if (configuration.enabled) {
        send = await deps.startSending(configuration);
      }
    } catch {
      send = undefined;
    }
    stopKeepingWindowErrors();
    const pending = kept ?? [];
    kept = undefined;
    if (send) {
      for (const error of pending) {
        send(error);
      }
    }
  }

  return { report, settled: settle() };
}
