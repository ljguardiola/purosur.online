import { heldPermissionKeys } from "../model/holds-permission.js";
import { isSessionExpired } from "../model/session-expiry.js";
import type { OpenSession, Sessions } from "./sessions.js";

export interface FindOpenSessionPorts {
  sessions: Sessions;
}

export interface FindOpenSessionInput {
  sessionKey: string;
  now: Date;
}

export type FindOpenSessionOutcome =
  | { kind: "absent" }
  | { kind: "ended" }
  | { kind: "open"; session: OpenSession };

export async function findOpenSession(
  { sessions }: FindOpenSessionPorts,
  input: FindOpenSessionInput,
): Promise<FindOpenSessionOutcome> {
  const stored = await sessions.findSession(input.sessionKey);
  if (!stored || stored.revokedAt) {
    return { kind: "absent" };
  }
  if (isSessionExpired(stored, input.now) || !stored.userActive) {
    return { kind: "ended" };
  }
  return {
    kind: "open",
    session: {
      sessionId: stored.sessionId,
      userId: stored.userId,
      firstName: stored.firstName,
      createdAt: stored.createdAt,
      lastSeenAt: stored.lastSeenAt,
      locationId: stored.locationId,
      isAdministrator: stored.isAdministrator,
      passkeyAuthorizedAt: stored.passkeyAuthorizedAt,
      permissionKeys: heldPermissionKeys({
        isAdministrator: stored.isAdministrator,
        permissionKeys: stored.grantedPermissionKeys,
      }),
    },
  };
}
