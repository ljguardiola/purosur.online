import {
  hasBitlockerRecoveryKeyShape,
  isBitlockerKeyIdentifier,
  isBitlockerRecoveryKey,
} from "@purosur/domain";
import { z } from "zod";

export const bitlockerRecoveryKeyShapeSchema = z.string().refine(hasBitlockerRecoveryKeyShape, {
  message: "recovery_key must be eight blocks of six digits separated by hyphens",
  abort: true,
});

export const bitlockerRecoveryKeyLoadBodySchema = z.object({
  recovery_key: bitlockerRecoveryKeyShapeSchema.refine(
    isBitlockerRecoveryKey,
    "recovery_key blocks must be multiples of 11 below 720896",
  ),
  key_identifier: z
    .string()
    .refine(isBitlockerKeyIdentifier, "key_identifier must be eight uppercase hexadecimal digits"),
});

export type BitlockerRecoveryKeyLoadBody = z.output<typeof bitlockerRecoveryKeyLoadBodySchema>;

export const bitlockerRecoveryKeySchema = z.object({
  recovery_key: z.string(),
  key_identifier: z.string(),
});

export type BitlockerRecoveryKeyBody = z.output<typeof bitlockerRecoveryKeySchema>;
