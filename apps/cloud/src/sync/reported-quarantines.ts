import type { QuarantineNotices } from "@purosur/domain/sync/use-cases";
import type { reportError } from "../platform/error-reporting.js";

// Drizzle appends the values a failed query was given, which can carry a sale's buyer.
const QUERY_PARAMETERS_PATTERN = /\nparams: [\s\S]*$/;

export function reportedQuarantines(report: typeof reportError): QuarantineNotices {
  return {
    quarantined: ({ error, ...context }) => {
      report(
        "sync: a synced event was quarantined",
        new Error(error.replace(QUERY_PARAMETERS_PATTERN, "")),
        { context: { ...context } },
      );
    },
  };
}
