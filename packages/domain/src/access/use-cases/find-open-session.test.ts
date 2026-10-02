import { describe, expect, it } from "vitest";
import { PERMISSION_KEYS } from "../model/permission-catalog.js";
import { findOpenSession } from "./find-open-session.js";
import { FakeSessions } from "./test-support/fake-sessions.js";
import { CREATED_AT, SESSION_KEY, storedSession } from "./test-support/session-fixtures.js";

const MINUTE = 60 * 1000;
const NOW = new Date(CREATED_AT.getTime() + 10 * MINUTE);

function find(session: ReturnType<typeof storedSession> | undefined, now = NOW) {
  const sessions = new FakeSessions();
  if (session) {
    sessions.seedSession(SESSION_KEY, session);
  }
  return findOpenSession({ sessions }, { sessionKey: SESSION_KEY, now });
}

describe("findOpenSession", () => {
  it("is absent for a session that was never stored", async () => {
    expect(await find(undefined)).toEqual({ kind: "absent" });
  });

  it("is absent for a session that was revoked", async () => {
    expect(await find(storedSession({ revokedAt: CREATED_AT }))).toEqual({ kind: "absent" });
  });

  it("is absent for a revoked session even when it has also expired", async () => {
    const later = new Date(CREATED_AT.getTime() + 13 * 60 * MINUTE);

    expect(await find(storedSession({ revokedAt: CREATED_AT }), later)).toEqual({
      kind: "absent",
    });
  });

  it("is ended for a session idle past the idle timeout", async () => {
    const idle = new Date(CREATED_AT.getTime() + 30 * MINUTE);

    expect(await find(storedSession(), idle)).toEqual({ kind: "ended" });
  });

  it("is ended for a session whose user was deactivated", async () => {
    expect(await find(storedSession({ userActive: false }))).toEqual({ kind: "ended" });
  });

  it("is open for a live session of an active user, with what the caller needs of it", async () => {
    const passkeyAuthorizedAt = new Date(CREATED_AT.getTime() + MINUTE);

    const found = await find(storedSession({ passkeyAuthorizedAt }));

    expect(found).toEqual({
      kind: "open",
      session: {
        sessionId: "session-1",
        userId: "u-1",
        firstName: "Ana",
        createdAt: CREATED_AT,
        lastSeenAt: CREATED_AT,
        locationId: "branch-1",
        isAdministrator: false,
        passkeyAuthorizedAt,
        permissionKeys: [],
      },
    });
  });

  it("holds every permission for an administrator", async () => {
    const found = await find(storedSession({ isAdministrator: true }));

    expect(found.kind === "open" && found.session.permissionKeys).toEqual(PERMISSION_KEYS);
  });

  it("holds only the permissions its role was granted", async () => {
    const found = await find(
      storedSession({ grantedPermissionKeys: ["sell_and_charge", "not-a-permission"] }),
    );

    expect(found.kind === "open" && found.session.permissionKeys).toEqual(["sell_and_charge"]);
  });
});
