import { randomUUID } from "node:crypto";
import { RECOVERY_TOKEN_LIFETIME_MS } from "@purosur/domain";
import { and, eq, isNull } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { FastifyInstance } from "fastify";
import {
  AuthenticatorEmulator,
  PasskeysCredentialsMemoryRepository,
  WebAuthnEmulator,
} from "nid-webauthn-emulator";
import {
  passkeys,
  recoveryTokens,
  roles,
  sessions,
  userRoles,
  users,
} from "../../platform/db/schema.js";
import { SESSION_COOKIE_NAME } from "../../sessions/session-cookie.js";
import { generateSessionId, hashSessionId } from "../../sessions/session-id.js";
import { seededLocationId } from "../../test-support/seeded-location.js";
import { registerRecoveryRedemptionRoutes } from "../recovery-redemption-route.js";
import { hashRecoveryToken } from "../recovery-token-hash.js";
import { registerSessionAuthenticateRoute } from "../session-authenticate-route.js";
import { registerSessionAuthenticationOptionsRoute } from "../session-authentication-options-route.js";

export const BACKOFFICE_ORIGIN = "https://staging.purosur.online";

type Database = PostgresJsDatabase<Record<string, never>>;

export function registerPasskeyRaceRoutes(app: FastifyInstance, db: Database): void {
  const options = { db, now: () => new Date(), backofficeOrigin: BACKOFFICE_ORIGIN };
  registerRecoveryRedemptionRoutes(app, options);
  registerSessionAuthenticationOptionsRoute(app, options);
  registerSessionAuthenticateRoute(app, { ...options, delay: async () => {} });
}

export function newDeviceEmulator(): WebAuthnEmulator {
  return new WebAuthnEmulator(
    new AuthenticatorEmulator({ credentialsRepository: new PasskeysCredentialsMemoryRepository() }),
  );
}

export function passkeyRaceFixture(current: { db: () => Database; app: () => FastifyInstance }) {
  let addressSequence = 0;

  // A source address of its own per request, so no per-address rate limit or lockout builds up.
  function nextSourceAddress(): string {
    addressSequence += 1;
    return `198.51.100.${addressSequence}`;
  }

  async function roleId(isAdministrator: boolean): Promise<string> {
    const db = current.db();
    if (isAdministrator) {
      const [role] = await db
        .select({ id: roles.id })
        .from(roles)
        .where(eq(roles.isAdministrator, true));
      if (!role) throw new Error("test setup: no Administrator role seeded");
      return role.id;
    }
    const [role] = await db
      .insert(roles)
      .values({ name: `Cajera ${randomUUID()}`, isAdministrator: false })
      .returning({ id: roles.id });
    if (!role) throw new Error("test setup: seeding the role returned no row");
    return role.id;
  }

  async function insertUser(isAdministrator: boolean): Promise<string> {
    const db = current.db();
    const [user] = await db
      .insert(users)
      .values({
        firstName: "Grace Villalba",
        email: `user-${randomUUID()}@example.com`,
        locationId: await seededLocationId(db),
      })
      .returning({ id: users.id });
    if (!user) throw new Error("test setup: seeding the user returned no row");
    await db.insert(userRoles).values({ userId: user.id, roleId: await roleId(isAdministrator) });
    return user.id;
  }

  async function registerPasskey(userId: string, emulator: WebAuthnEmulator): Promise<string> {
    const db = current.db();
    const app = current.app();
    const rawToken = `raw-token-${randomUUID()}`;
    await db.insert(recoveryTokens).values({
      userId,
      tokenHash: hashRecoveryToken(rawToken),
      issuedAt: new Date(),
      expiresAt: new Date(Date.now() + RECOVERY_TOKEN_LIFETIME_MS),
    });
    const headers = { origin: BACKOFFICE_ORIGIN, "x-real-ip": nextSourceAddress() };
    const options = await app.inject({
      method: "POST",
      url: "/account-recovery-challenges",
      headers,
      payload: { recovery_token: rawToken },
    });
    const credential = emulator.createJSON(
      BACKOFFICE_ORIGIN,
      options.json().passkey_registration_options,
    );
    const redeemed = await app.inject({
      method: "POST",
      url: "/account-recovery-redemptions",
      headers,
      payload: {
        recovery_token: rawToken,
        passkey_registration: credential,
        passkey_name: "Notebook del local",
      },
    });
    if (redeemed.statusCode !== 200) {
      throw new Error(`test setup: redeem failed: ${redeemed.statusCode} ${redeemed.body}`);
    }
    const [row] = await db
      .select({ id: passkeys.id })
      .from(passkeys)
      .where(eq(passkeys.userId, userId));
    if (!row) throw new Error("test setup: the registered passkey was not found");
    return row.id;
  }

  async function insertSession(userId: string, authorized = true): Promise<string> {
    const rawSessionId = generateSessionId();
    const now = new Date();
    await current
      .db()
      .insert(sessions)
      .values({
        userId,
        sessionIdHash: hashSessionId(rawSessionId),
        createdAt: now,
        lastSeenAt: now,
        passkeyAuthorizedAt: authorized ? now : null,
      });
    return rawSessionId;
  }

  async function signedInAdministrator(): Promise<{ cookie: string; emulator: WebAuthnEmulator }> {
    const administratorId = await insertUser(true);
    const emulator = newDeviceEmulator();
    await registerPasskey(administratorId, emulator);
    return { cookie: `${SESSION_COOKIE_NAME}=${await insertSession(administratorId)}`, emulator };
  }

  async function prepareSignIn(emulator: WebAuthnEmulator) {
    const app = current.app();
    const headers = { origin: BACKOFFICE_ORIGIN, "x-real-ip": nextSourceAddress() };
    const options = await app.inject({
      method: "POST",
      url: "/authentication-challenges",
      headers,
    });
    const assertion = emulator.getJSON(
      BACKOFFICE_ORIGIN,
      options.json().passkey_authentication_options,
    );
    return () =>
      app.inject({
        method: "POST",
        url: "/sessions",
        headers,
        payload: { assertion },
      });
  }

  async function liveSessionsOf(userId: string) {
    return current
      .db()
      .select()
      .from(sessions)
      .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
  }

  return {
    insertUser,
    registerPasskey,
    insertSession,
    signedInAdministrator,
    prepareSignIn,
    liveSessionsOf,
  };
}
