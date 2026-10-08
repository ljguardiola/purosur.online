import { z } from "zod";

// The library leaves a key set to undefined for an option it was not given, which JSON drops.
const withoutUndefinedKeys = z
  .record(z.string(), z.unknown())
  .transform((value) =>
    Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)),
  );

const userVerification = z.enum(["discouraged", "preferred", "required"]);
const hints = z.array(z.enum(["hybrid", "security-key", "client-device"]));

const credentialDescriptor = z.object({
  id: z.string(),
  transports: z.exactOptional(z.array(z.string())),
  type: z.string(),
});

const extensions = z.looseObject({
  appid: z.exactOptional(z.string()),
  credProps: z.exactOptional(z.boolean()),
  hmacCreateSecret: z.exactOptional(z.boolean()),
  minPinLength: z.exactOptional(z.boolean()),
});

export const creationOptionsSchema = withoutUndefinedKeys.pipe(
  z.object({
    rp: z.object({ name: z.string(), id: z.exactOptional(z.string()) }),
    user: z.object({ id: z.string(), name: z.string(), displayName: z.string() }),
    challenge: z.string(),
    pubKeyCredParams: z.array(z.object({ alg: z.number(), type: z.literal("public-key") })),
    timeout: z.exactOptional(z.number()),
    excludeCredentials: z.exactOptional(z.array(credentialDescriptor)),
    authenticatorSelection: z.exactOptional(
      z.object({
        authenticatorAttachment: z.exactOptional(z.enum(["cross-platform", "platform"])),
        requireResidentKey: z.exactOptional(z.boolean()),
        residentKey: z.exactOptional(z.enum(["discouraged", "preferred", "required"])),
        userVerification: z.exactOptional(userVerification),
      }),
    ),
    hints: z.exactOptional(hints),
    attestation: z.exactOptional(z.enum(["direct", "enterprise", "indirect", "none"])),
    attestationFormats: z.exactOptional(
      z.array(
        z.enum(["fido-u2f", "packed", "android-safetynet", "android-key", "tpm", "apple", "none"]),
      ),
    ),
    extensions: z.exactOptional(extensions),
  }),
);

export const requestOptionsSchema = withoutUndefinedKeys.pipe(
  z.object({
    challenge: z.string(),
    timeout: z.exactOptional(z.number()),
    rpId: z.exactOptional(z.string()),
    allowCredentials: z.exactOptional(z.array(credentialDescriptor)),
    userVerification: z.exactOptional(userVerification),
    hints: z.exactOptional(hints),
    extensions: z.exactOptional(extensions),
  }),
);
