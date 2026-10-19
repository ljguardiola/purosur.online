import { isBitlockerKeyIdentifier, isBitlockerRecoveryKey } from "@purosur/domain";
import { z } from "zod";

export const bitlockerRecoveryKeyLoadBodySchema = z.object({
  recovery_key: z
    .string()
    .refine(
      isBitlockerRecoveryKey,
      "recovery_key must be eight blocks of six digits separated by hyphens",
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
