import type { CoreStartupStep, CoreStartupStepMessage } from "@purosur/contracts";

type ReportStartupStep = (step: CoreStartupStep) => void;

export function startupStepReporter(
  post: (message: CoreStartupStepMessage) => void,
): ReportStartupStep {
  return (step) => post({ type: "core-startup-step", step });
}

export function takingStartupStep<Args extends unknown[], Answer>(
  reportStep: ReportStartupStep,
  step: CoreStartupStep,
  take: (...args: Args) => Answer,
): (...args: Args) => Answer {
  return (...args) => {
    reportStep(step);
    return take(...args);
  };
}

export async function prepareLocalDataFolder(deps: {
  setAsideStaleDatabase: () => Promise<unknown>;
  adoptStagedSnapshot: () => Promise<unknown>;
  reportStep: ReportStartupStep;
  onFailure: (error: unknown) => void;
}): Promise<void> {
  try {
    deps.reportStep("set_aside_stale_database");
    await deps.setAsideStaleDatabase();
    deps.reportStep("adopt_staged_snapshot");
    await deps.adoptStagedSnapshot();
  } catch (error) {
    deps.onFailure(error);
  }
}
