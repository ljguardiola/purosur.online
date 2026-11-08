const DEVICE_TOKEN_VALIDITY_MS = 7 * 24 * 60 * 60 * 1000;
const DEVICE_TOKEN_ROTATION_INTERVAL_MS = 24 * 60 * 60 * 1000;

export function deviceTokenExpiresAt(issuedAt: Date): Date {
  return new Date(issuedAt.getTime() + DEVICE_TOKEN_VALIDITY_MS);
}

export function isDeviceTokenExpired(issuedAt: Date, now: Date): boolean {
  return now >= deviceTokenExpiresAt(issuedAt);
}

export function isDeviceTokenRotationDue(receivedAt: Date, now: Date): boolean {
  // A receipt time ahead of now was stamped by a clock that has since been set back, so the
  // elapsed time is unknown while the cloud keeps counting the token's 7 days.
  if (receivedAt > now) {
    return true;
  }
  return now.getTime() >= receivedAt.getTime() + DEVICE_TOKEN_ROTATION_INTERVAL_MS;
}
