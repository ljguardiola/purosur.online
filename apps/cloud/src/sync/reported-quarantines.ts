import type { QuarantineNotices } from "@purosur/domain/sync/use-cases";
import type { reportError } from "../platform/error-reporting.js";

export function reportedQuarantines(report: typeof reportError): QuarantineNotices {
  return {
    quarantined: ({ error, ...context }) => {
      report("sync: a synced event was quarantined", new Error(error), {
        context: { ...context },
      });
    },
  };
}
