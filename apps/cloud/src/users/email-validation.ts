const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+$/;
// The longest address SMTP can deliver to (RFC 5321's 256-octet path minus its angle brackets),
// same bound `request-recovery-route.ts` applies to the address it stores this one must later match.
export const EMAIL_MAX_LENGTH = 254;

/**
 * Trims and lowercases `email` off a request body and requires it look like `local@domain` within
 * `EMAIL_MAX_LENGTH`. Shared by every route that accepts an email from an Administrator
 * (`user-creation-route.ts`, `user-edit-route.ts`), so normalization and validation never drift
 * between them.
 */
export function readEmail(body: unknown): string | undefined {
  const raw = (body as { email?: unknown } | undefined)?.email;
  if (typeof raw !== "string") {
    return undefined;
  }
  const email = raw.trim().toLowerCase();
  return email.length <= EMAIL_MAX_LENGTH && EMAIL_SHAPE.test(email) ? email : undefined;
}
