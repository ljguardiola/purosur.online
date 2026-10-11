import {
  reportsFailedQuery,
  withoutEchoedQueryValues,
  withoutQueryParameters,
} from "@purosur/contracts";

export function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }
  const code = (error as { code: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

function describeFailure(error: unknown, behindFailedQuery: boolean): string {
  const code = errorCode(error) ?? "unknown error";
  if (!(error instanceof Error)) {
    return code;
  }
  const message = behindFailedQuery
    ? withoutEchoedQueryValues(error.message)
    : withoutQueryParameters(error.message);
  const description = `${code}: ${message}`;
  return error.cause === undefined
    ? description
    : `${description} (caused by ${describeFailure(error.cause, behindFailedQuery || reportsFailedQuery(error.message))})`;
}

// Only the code and message are printed: an error can carry a connection string, password
// included, in another field (e.g. an invalid URL's `input`), and a driver error the value it
// refused (e.g. postgres.js's `detail`).
export function describeDatabaseFailure(error: unknown): string {
  return describeFailure(error, false);
}
