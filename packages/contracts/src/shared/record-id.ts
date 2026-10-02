import { z } from "zod";

export function recordIdSchema(
  message: string | ((issue: { input?: unknown }) => string) = "must be a record id",
) {
  return z.guid({ error: message }).toLowerCase();
}
