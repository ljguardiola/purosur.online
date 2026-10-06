interface CoreFailureReportersDeps {
  log: (message: string, error: unknown) => void;
  capture: (error: unknown) => unknown;
  watchFailure: (error: unknown) => Promise<void>;
}

interface CoreFailureReporters {
  reportFailure: (context: string, error: unknown) => void;
  reportSyncFailure: (error: unknown) => void;
  reportRedeemedPinFailure: (error: unknown) => void;
}

export function coreFailureReporters(deps: CoreFailureReportersDeps): CoreFailureReporters {
  return {
    reportFailure: (context, error) => {
      deps.log(`core: ${context} failed`, error);
      deps.capture(error);
      void deps.watchFailure(error);
    },
    reportSyncFailure: (error) => {
      deps.log("core: the sync failed", error);
      void deps.watchFailure(error);
    },
    reportRedeemedPinFailure: (error) => {
      deps.log("core: the redeemed PIN could not be kept locally", error);
      deps.capture(error);
      void deps.watchFailure(error);
    },
  };
}
