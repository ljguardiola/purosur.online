import { DrizzleQueryError } from "drizzle-orm";

export function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }
  const code = (error as { code: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

// A failed query's message lists the values it was given, which come from the request.
function messageOf(error: Error): string {
  return error instanceof DrizzleQueryError ? `Failed query: ${error.query}` : error.message;
}

// Only the code and message are printed: an error can carry a connection string, password
// included, in another field (e.g. an invalid URL's `input`).
export function describeDatabaseFailure(error: unknown): string {
  const code = errorCode(error) ?? "unknown error";
  if (!(error instanceof Error)) {
    return code;
  }
  const description = `${code}: ${messageOf(error)}`;
  return error.cause === undefined
    ? description
    : `${description} (caused by ${describeDatabaseFailure(error.cause)})`;
}
