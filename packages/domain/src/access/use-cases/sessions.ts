import type { PermissionKey } from "../../permissions/index.js";

export interface StoredSession {
  sessionId: string;
  userId: string;
  firstName: string;
  locationId: string;
  createdAt: Date;
  lastSeenAt: Date;
  revokedAt: Date | null;
  passkeyAuthorizedAt: Date | null;
  userActive: boolean;
  isAdministrator: boolean;
  grantedPermissionKeys: string[];
}

export interface OpenSession {
  sessionId: string;
  userId: string;
  firstName: string;
  createdAt: Date;
  lastSeenAt: Date;
  locationId: string;
  isAdministrator: boolean;
  passkeyAuthorizedAt: Date | null;
  permissionKeys: readonly PermissionKey[];
}

export interface Sessions {
  findSession(sessionKey: string): Promise<StoredSession | undefined>;
}
