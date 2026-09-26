const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+$/;
// The longest address SMTP can deliver to (RFC 5321's 256-octet path minus its angle brackets).
export const EMAIL_MAX_LENGTH = 254;

// Shared by every route that accepts an email, so normalization and validation never drift.
export function readEmail(body: unknown): string | undefined {
  const raw = (body as { email?: unknown } | undefined)?.email;
  if (typeof raw !== "string") {
    return undefined;
  }
  const email = raw.trim().toLowerCase();
  return email.length <= EMAIL_MAX_LENGTH && EMAIL_SHAPE.test(email) ? email : undefined;
}
