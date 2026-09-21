export function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }
  const code = (error as { code: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

// Only the code and message are printed: an error can carry the connection string in other
// fields (an invalid URL keeps it, password included, in `input`).
export function describeDatabaseFailure(error: unknown): string {
  const code = errorCode(error) ?? "unknown error";
  if (!(error instanceof Error)) {
    return code;
  }
  const description = `${code}: ${error.message}`;
  return error.cause === undefined
    ? description
    : `${description} (caused by ${describeDatabaseFailure(error.cause)})`;
}
