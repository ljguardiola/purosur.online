type ValidationFailedBody = {
  code?: unknown;
  details?: unknown;
};

export async function readValidationFailedField(response: Response): Promise<string | undefined> {
  const body: unknown = await response.json().catch(() => undefined);
  if (typeof body !== "object" || body === null) {
    return undefined;
  }
  const { code, details } = body as ValidationFailedBody;
  if (code !== "validation_failed" || !Array.isArray(details)) {
    return undefined;
  }
  const field = (details[0] as { field?: unknown } | undefined)?.field;
  return typeof field === "string" && field !== "" ? field : undefined;
}
