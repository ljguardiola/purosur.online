import type { RegisterVersion } from "@purosur/domain";
import { z } from "zod";

const VERSION_TEXT = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const SHA512_BASE64 = /^[A-Za-z0-9+/]{85}[AQgw]==$/;
const INSTALLER_FILE_NAME = /^[\p{L}\p{N}][\p{L}\p{N} ._-]*\.exe$/u;
const INSTALLER_FILE_NAME_MAX_LENGTH = 200;

const versionTextSchema = z
  .string()
  .regex(VERSION_TEXT)
  .refine((text) => text.split(".").every((part) => Number.isSafeInteger(Number(part))));

export const registerVersionSchema = versionTextSchema.transform((text): RegisterVersion => {
  const [major = 0, minor = 0, patch = 0] = text.split(".").map(Number);
  return { major, minor, patch };
});

export function registerVersionText({ major, minor, patch }: RegisterVersion): string {
  return [major, minor, patch].join(".");
}

export const registerUpdateQuerySchema = z.strictObject({
  installed_version: registerVersionSchema,
});

const sizeSchema = z.number().int().positive().safe();
const sha512Schema = z.string().regex(SHA512_BASE64);

const installerFileNameSchema = z
  .string()
  .max(INSTALLER_FILE_NAME_MAX_LENGTH)
  .regex(INSTALLER_FILE_NAME)
  .refine((name) => !name.includes(".."));

export const registerReleaseEntrySchema = z.strictObject({
  version: registerVersionSchema,
  file: installerFileNameSchema,
  size: sizeSchema,
  sha512: sha512Schema,
});

export const registerUpdateAnswerSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("up_to_date") }),
  z.object({
    status: z.literal("available"),
    version: versionTextSchema,
    size: sizeSchema,
    sha512: sha512Schema,
    download_url: z.url({ protocol: /^https$/ }),
  }),
]);
export type RegisterUpdateAnswer = z.input<typeof registerUpdateAnswerSchema>;
