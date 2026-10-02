import { z } from "zod";

export function requiredTextSchema(
  field: string,
  maxLength: number,
  isTooLong: (value: string) => boolean,
) {
  const message = `${field} must be a non-empty string of at most ${maxLength} characters`;
  return z
    .string({ error: message })
    .trim()
    .min(1, message)
    .refine((value) => !isTooLong(value), message)
    .meta({ maxLength });
}
