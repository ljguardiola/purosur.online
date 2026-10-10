import { z } from "zod";

export function optionalTextSchema(message: string, isAcceptable: (value: string) => boolean) {
  return z
    .string({ error: message })
    .trim()
    .nullish()
    .transform((value) => (value === undefined || value === "" ? null : value))
    .pipe(
      z
        .string()
        .nullable()
        .refine((value) => value === null || isAcceptable(value), message),
    );
}

export function optionalLimitedTextSchema(
  field: string,
  maxLength: number,
  isTooLong: (value: string) => boolean,
) {
  return optionalTextSchema(
    `${field} must be a string of at most ${maxLength} characters`,
    (value) => !isTooLong(value),
  ).meta({ maxLength });
}
