import type { ErrorReportingConfiguration } from "@purosur/contracts";

const OFF: ErrorReportingConfiguration = { enabled: false };

function isEnabledConfiguration(
  body: unknown,
): body is Extract<ErrorReportingConfiguration, { enabled: true }> {
  if (typeof body !== "object" || body === null) {
    return false;
  }
  const { enabled, dsn, environment, release } = body as Record<string, unknown>;
  return (
    enabled === true &&
    typeof dsn === "string" &&
    typeof environment === "string" &&
    typeof release === "string"
  );
}

export async function fetchErrorReportingConfiguration(): Promise<ErrorReportingConfiguration> {
  try {
    const response = await fetch("/error-reporting");
    if (!response.ok) {
      return OFF;
    }
    const body: unknown = await response.json();
    return isEnabledConfiguration(body) ? body : OFF;
  } catch {
    return OFF;
  }
}
