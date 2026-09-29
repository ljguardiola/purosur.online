const DEVICE_TOKEN_VALIDITY_MS = 7 * 24 * 60 * 60 * 1000;
const DEVICE_TOKEN_ROTATION_INTERVAL_MS = 24 * 60 * 60 * 1000;

export function deviceTokenExpiresAt(issuedAt: Date): Date {
  return new Date(issuedAt.getTime() + DEVICE_TOKEN_VALIDITY_MS);
}

export function isDeviceTokenExpired(issuedAt: Date, now: Date): boolean {
  return now >= deviceTokenExpiresAt(issuedAt);
}

export function isDeviceTokenRotationDue(receivedAt: Date, now: Date): boolean {
  return now.getTime() >= receivedAt.getTime() + DEVICE_TOKEN_ROTATION_INTERVAL_MS;
}
