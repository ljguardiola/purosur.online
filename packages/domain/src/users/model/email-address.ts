const EMAIL_ADDRESS_SHAPE = /^[^\s@]+@[^\s@]+$/;

// The longest address SMTP can deliver to (RFC 5321's 256-octet path minus its angle brackets).
export const EMAIL_ADDRESS_MAX_LENGTH = 254;

export function isEmailAddress(value: string): boolean {
  return value.length <= EMAIL_ADDRESS_MAX_LENGTH && EMAIL_ADDRESS_SHAPE.test(value);
}
