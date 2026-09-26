const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+$/;
// The longest address SMTP can deliver to (RFC 5321's 256-octet path minus its angle brackets).
export const EMAIL_MAX_LENGTH = 254;

/**
 * Trims and lowercases `email` off a request body and requires it look like `local@domain` within
 * `EMAIL_MAX_LENGTH`. Shared by every route that accepts an email, whether from an Administrator
 * (`user-creation-route.ts`, `user-edit-route.ts`) or from the public
 * (`request-recovery-route.ts`), so normalization and validation never drift between them.
 */
export function readEmail(body: unknown): string | undefined {
  const raw = (body as { email?: unknown } | undefined)?.email;
  if (typeof raw !== "string") {
    return undefined;
  }
  const email = raw.trim().toLowerCase();
  return email.length <= EMAIL_MAX_LENGTH && EMAIL_SHAPE.test(email) ? email : undefined;
}
