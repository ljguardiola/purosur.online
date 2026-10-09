import { z } from "zod";

export const passkeyAssertionSchema = z.custom<{ id: string }>(
  (value) =>
    typeof value === "object" &&
    value !== null &&
    typeof (value as { id?: unknown }).id === "string",
  "the assertion must carry the credential's id",
);
