import { PGlite } from "@electric-sql/pglite";
import { and, eq, isNull } from "drizzle-orm";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import Fastify, { type FastifyInstance } from "fastify";
import WebAuthnEmulator from "nid-webauthn-emulator";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  auditLog,
  passkeys,
  recoveryRejectedAttemptAccumulator,
  recoveryTokens,
  users,
} from "../db/schema.js";
import { registerRecoveryRedemptionRoutes } from "./recovery-redemption-route.js";
import { hashRecoveryToken } from "./recovery-token-hash.js";

const MIGRATIONS_FOLDER = new URL("../../migrations", import.meta.url).pathname;
const BACKOFFICE_ORIGIN = "https://staging.purosur.online";
const NOON = new Date("2026-01-05T12:00:00.000Z");
const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

let client: PGlite;
let db: PgliteDatabase<Record<string, never>>;
let app: FastifyInstance;
let userId: string;
let tokenSequence: number;
let currentTime: Date;

beforeEach(async () => {
  client = new PGlite();
  db = drizzle(client);
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  tokenSequence = 0;

  const [user] = await db
    .insert(users)
    .values({ firstName: "Ada Lovelace", email: "ada@example.com" })
    .returning({ id: users.id });
  if (!user) {
    throw new Error("seeding the test user returned no row");
  }
  userId = user.id;

  currentTime = NOON;
  app = Fastify();
  registerRecoveryRedemptionRoutes(app, {
    db,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    now: () => currentTime,
  });
});

afterEach(async () => {
  await app.close();
  await client.close();
});

interface IssueTokenOverrides {
  usedAt?: Date;
  voidedAt?: Date;
  expiresAt?: Date;
  forUserId?: string;
}

async function issueToken(overrides: IssueTokenOverrides = {}): Promise<string> {
  tokenSequence += 1;
  const rawToken = `raw-token-${tokenSequence}`;
  const forUserId = overrides.forUserId ?? userId;
  // An account holds one live token at a time: issuing another voids the previous one first.
  if (!overrides.usedAt && !overrides.voidedAt) {
    await db
      .update(recoveryTokens)
      .set({ voidedAt: NOON })
      .where(
        and(
          eq(recoveryTokens.userId, forUserId),
          isNull(recoveryTokens.usedAt),
          isNull(recoveryTokens.voidedAt),
        ),
      );
  }
  await db.insert(recoveryTokens).values({
    userId: forUserId,
    tokenHash: hashRecoveryToken(rawToken),
    issuedAt: NOON,
    expiresAt: overrides.expiresAt ?? new Date(NOON.getTime() + FIFTEEN_MINUTES_MS),
    ...(overrides.usedAt ? { usedAt: overrides.usedAt } : {}),
    ...(overrides.voidedAt ? { voidedAt: overrides.voidedAt } : {}),
  });
  return rawToken;
}

function postOptions(body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return app.inject({
    method: "POST",
    url: "/users/recovery/registration-options",
    headers: { origin: BACKOFFICE_ORIGIN, "x-real-ip": "203.0.113.10", ...headers },
    payload: body,
  });
}

function postRedeem(body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return app.inject({
    method: "POST",
    url: "/users/recovery/redeem",
    headers: { origin: BACKOFFICE_ORIGIN, "x-real-ip": "203.0.113.10", ...headers },
    payload: body,
  });
}

async function getRegistrationOptions(rawToken: string) {
  const response = await postOptions({ recovery_token: rawToken });
  if (response.statusCode !== 200) {
    throw new Error(`registration-options failed: ${response.statusCode} ${response.body}`);
  }
  return response.json().passkey_registration_options;
}

describe("POST /users/recovery/registration-options", () => {
  it("returns creation options and the account's display name for a valid token", async () => {
    const rawToken = await issueToken();

    const response = await postOptions({ recovery_token: rawToken });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.display_name).toBe("Ada Lovelace");
    expect(body.passkey_registration_options.rp).toEqual({
      name: "Puro Sur",
      id: "staging.purosur.online",
    });
    expect(body.passkey_registration_options.user.name).toBe("ada@example.com");
    expect(body.passkey_registration_options.authenticatorSelection).toMatchObject({
      residentKey: "required",
      userVerification: "required",
    });
  });

  it("stores the returned challenge on the token row", async () => {
    const rawToken = await issueToken();

    const response = await postOptions({ recovery_token: rawToken });

    const [row] = await db
      .select({ challenge: recoveryTokens.registrationChallenge })
      .from(recoveryTokens)
      .where(eq(recoveryTokens.tokenHash, hashRecoveryToken(rawToken)));
    expect(row?.challenge).toBe(response.json().passkey_registration_options.challenge);
  });

  it("does not burn the token", async () => {
    const rawToken = await issueToken();

    await postOptions({ recovery_token: rawToken });

    const [row] = await db
      .select({ usedAt: recoveryTokens.usedAt })
      .from(recoveryTokens)
      .where(eq(recoveryTokens.tokenHash, hashRecoveryToken(rawToken)));
    expect(row?.usedAt).toBeNull();
  });

  it("does not open a session", async () => {
    const rawToken = await issueToken();

    const response = await postOptions({ recovery_token: rawToken });

    expect(response.headers["set-cookie"]).toBeUndefined();
  });

  it("excludes the account's existing passkeys", async () => {
    await db.insert(passkeys).values({
      userId,
      credentialId: "existingcredentialid",
      publicKey: "unused-in-this-test",
      counter: 0,
      deviceType: "singleDevice",
      backedUp: false,
    });
    const rawToken = await issueToken();

    const response = await postOptions({ recovery_token: rawToken });

    expect(response.json().passkey_registration_options.excludeCredentials).toEqual([
      { id: "existingcredentialid", type: "public-key" },
    ]);
  });

  it("overwrites the challenge on a repeat call", async () => {
    const rawToken = await issueToken();

    const first = await postOptions({ recovery_token: rawToken });
    const second = await postOptions({ recovery_token: rawToken });

    expect(second.json().passkey_registration_options.challenge).not.toBe(
      first.json().passkey_registration_options.challenge,
    );
  });

  it("rejects an unknown token as recovery_token_invalid", async () => {
    const response = await postOptions({ recovery_token: "an-unknown-raw-token" });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "recovery_token_invalid" });
  });

  it("rejects a missing recovery_token as recovery_token_invalid", async () => {
    const response = await postOptions({});

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "recovery_token_invalid" });
  });

  it("rejects an already-used token as recovery_token_burned", async () => {
    const rawToken = await issueToken({ usedAt: NOON });

    const response = await postOptions({ recovery_token: rawToken });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "recovery_token_burned" });
  });

  it("rejects a token voided by a newer request as recovery_token_burned", async () => {
    const rawToken = await issueToken({ voidedAt: NOON });

    const response = await postOptions({ recovery_token: rawToken });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "recovery_token_burned" });
  });

  it("rejects an expired token as recovery_token_expired", async () => {
    const rawToken = await issueToken({ expiresAt: new Date(NOON.getTime() - 1) });

    const response = await postOptions({ recovery_token: rawToken });

    expect(response.statusCode).toBe(410);
    expect(response.json()).toMatchObject({ code: "recovery_token_expired" });
  });

  it("rejects a missing Origin header", async () => {
    const rawToken = await issueToken();

    const response = await app.inject({
      method: "POST",
      url: "/users/recovery/registration-options",
      headers: { "x-real-ip": "203.0.113.10" },
      payload: { recovery_token: rawToken },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  it("rate-limits the 11th redemption attempt per hour from the same source address", async () => {
    for (let i = 0; i < 10; i++) {
      const rawToken = await issueToken();
      const response = await postOptions({ recovery_token: rawToken });
      expect(response.statusCode).toBe(200);
    }

    const rawToken = await issueToken();
    const eleventh = await postOptions({ recovery_token: rawToken });

    expect(eleventh.statusCode).toBe(429);
    expect(eleventh.json()).toMatchObject({ code: "rate_limited" });
    expect(eleventh.headers["retry-after"]).toBeDefined();
  });

  it("sends Retry-After as the seconds left until the limit frees a slot", async () => {
    for (let i = 0; i < 10; i++) {
      await postOptions({ recovery_token: "an-unknown-raw-token" });
    }
    currentTime = new Date(NOON.getTime() + 20 * 60 * 1000);

    const eleventh = await postOptions({ recovery_token: "an-unknown-raw-token" });

    expect(eleventh.statusCode).toBe(429);
    expect(eleventh.headers["retry-after"]).toBe(String(40 * 60));
  });
});

describe("POST /users/recovery/redeem", () => {
  it("registers exactly one passkey, burns the token, audits both, and opens no session", async () => {
    const rawToken = await issueToken();
    const options = await getRegistrationOptions(rawToken);
    const emulator = new WebAuthnEmulator();
    const credential = emulator.createJSON(BACKOFFICE_ORIGIN, options);

    const response = await postRedeem({
      recovery_token: rawToken,
      passkey_registration: credential,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ user_id: userId });
    expect(response.headers["set-cookie"]).toBeUndefined();

    const insertedPasskeys = await db.select().from(passkeys).where(eq(passkeys.userId, userId));
    expect(insertedPasskeys).toHaveLength(1);
    expect(insertedPasskeys[0]?.credentialId).toBe(credential.id);

    const [tokenRow] = await db
      .select({ usedAt: recoveryTokens.usedAt })
      .from(recoveryTokens)
      .where(eq(recoveryTokens.tokenHash, hashRecoveryToken(rawToken)));
    expect(tokenRow?.usedAt).not.toBeNull();

    const auditRows = await db.select().from(auditLog).where(eq(auditLog.actorId, userId));
    expect(auditRows.map((row) => row.entity).sort()).toEqual(["passkey", "recovery_token"]);
  });

  it("rejects reusing an already-redeemed token without registering a second passkey", async () => {
    const rawToken = await issueToken();
    const options = await getRegistrationOptions(rawToken);
    const emulator = new WebAuthnEmulator();
    const credential = emulator.createJSON(BACKOFFICE_ORIGIN, options);
    await postRedeem({ recovery_token: rawToken, passkey_registration: credential });

    const second = await postRedeem({ recovery_token: rawToken, passkey_registration: credential });

    expect(second.statusCode).toBe(409);
    expect(second.json()).toMatchObject({ code: "recovery_token_burned" });
    const insertedPasskeys = await db.select().from(passkeys).where(eq(passkeys.userId, userId));
    expect(insertedPasskeys).toHaveLength(1);
  });

  it("registers at most one passkey when the same token is redeemed concurrently", async () => {
    const rawToken = await issueToken();
    const options = await getRegistrationOptions(rawToken);
    const emulator = new WebAuthnEmulator();
    const credential = emulator.createJSON(BACKOFFICE_ORIGIN, options);

    const [first, second] = await Promise.all([
      postRedeem({ recovery_token: rawToken, passkey_registration: credential }),
      postRedeem({ recovery_token: rawToken, passkey_registration: credential }),
    ]);

    expect([first.statusCode, second.statusCode].sort()).toEqual([200, 409]);
    const insertedPasskeys = await db.select().from(passkeys).where(eq(passkeys.userId, userId));
    expect(insertedPasskeys).toHaveLength(1);
  });

  it("rejects a tampered client data JSON, without burning the token", async () => {
    const rawToken = await issueToken();
    const options = await getRegistrationOptions(rawToken);
    const emulator = new WebAuthnEmulator();
    const credential = emulator.createJSON(BACKOFFICE_ORIGIN, options);
    const tamperedCredential = {
      ...credential,
      response: {
        ...credential.response,
        clientDataJSON: `${credential.response.clientDataJSON.slice(0, -8)}AAAAAAAA`,
      },
    };

    const response = await postRedeem({
      recovery_token: rawToken,
      passkey_registration: tamperedCredential,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "validation_failed" });
    const [tokenRow] = await db
      .select({ usedAt: recoveryTokens.usedAt })
      .from(recoveryTokens)
      .where(eq(recoveryTokens.tokenHash, hashRecoveryToken(rawToken)));
    expect(tokenRow?.usedAt).toBeNull();
    const insertedPasskeys = await db.select().from(passkeys).where(eq(passkeys.userId, userId));
    expect(insertedPasskeys).toHaveLength(0);
  });

  it("rejects a passkey registration built against a different token's challenge", async () => {
    const rawTokenA = await issueToken();
    const optionsA = await getRegistrationOptions(rawTokenA);
    const emulator = new WebAuthnEmulator();
    const credentialA = emulator.createJSON(BACKOFFICE_ORIGIN, optionsA);

    const rawTokenB = await issueToken();
    await getRegistrationOptions(rawTokenB);

    const response = await postRedeem({
      recovery_token: rawTokenB,
      passkey_registration: credentialA,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "validation_failed" });
  });

  it("rejects redeeming before registration options were ever requested", async () => {
    const rawToken = await issueToken();

    const response = await postRedeem({
      recovery_token: rawToken,
      passkey_registration: {
        id: "x",
        rawId: "x",
        response: { clientDataJSON: "x", attestationObject: "x" },
        type: "public-key",
        clientExtensionResults: {},
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "validation_failed" });
  });

  it("rejects an unknown token as recovery_token_invalid", async () => {
    const response = await postRedeem({ recovery_token: "an-unknown-raw-token" });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "recovery_token_invalid" });
  });

  it("rejects an already-used token as recovery_token_burned", async () => {
    const rawToken = await issueToken({ usedAt: NOON });

    const response = await postRedeem({ recovery_token: rawToken });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "recovery_token_burned" });
  });

  it("rejects a token voided by a newer request as recovery_token_burned", async () => {
    const rawToken = await issueToken({ voidedAt: NOON });

    const response = await postRedeem({ recovery_token: rawToken });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "recovery_token_burned" });
  });

  it("rejects an expired token as recovery_token_expired", async () => {
    const rawToken = await issueToken({ expiresAt: new Date(NOON.getTime() - 1) });

    const response = await postRedeem({ recovery_token: rawToken });

    expect(response.statusCode).toBe(410);
    expect(response.json()).toMatchObject({ code: "recovery_token_expired" });
  });

  it("rejects a missing Origin header", async () => {
    const rawToken = await issueToken();

    const response = await app.inject({
      method: "POST",
      url: "/users/recovery/redeem",
      headers: { "x-real-ip": "203.0.113.10" },
      payload: { recovery_token: rawToken },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  it("shares its rate-limit budget with registration-options", async () => {
    for (let i = 0; i < 5; i++) {
      const rawToken = await issueToken();
      expect((await postOptions({ recovery_token: rawToken })).statusCode).toBe(200);
    }
    for (let i = 0; i < 5; i++) {
      const response = await postRedeem({ recovery_token: "an-unknown-raw-token" });
      expect(response.statusCode).toBe(404);
    }

    const rawToken = await issueToken();
    const eleventh = await postOptions({ recovery_token: rawToken });

    expect(eleventh.statusCode).toBe(429);
    expect(eleventh.json()).toMatchObject({ code: "rate_limited" });
  });
});

async function rejectedAttemptAuditRows() {
  const rows = await db.select().from(auditLog).where(eq(auditLog.entity, "recovery_token"));
  return rows.filter((row) => (row.newValue as { rejectedWith?: string } | null)?.rejectedWith);
}

async function deactivateUser() {
  await db.update(users).set({ active: false }).where(eq(users.id, userId));
}

async function registerCredentialAlready(credentialId: string) {
  await db.insert(passkeys).values({
    userId,
    credentialId,
    publicKey: "unused-in-this-test",
    counter: 0,
    deviceType: "singleDevice",
    backedUp: false,
  });
}

async function tokenUsedAt(rawToken: string) {
  const [tokenRow] = await db
    .select({ usedAt: recoveryTokens.usedAt })
    .from(recoveryTokens)
    .where(eq(recoveryTokens.tokenHash, hashRecoveryToken(rawToken)));
  return tokenRow?.usedAt;
}

describe("recovery redemption for a deactivated account", () => {
  it("rejects registration-options as recovery_token_invalid", async () => {
    const rawToken = await issueToken();
    await deactivateUser();

    const response = await postOptions({ recovery_token: rawToken });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "recovery_token_invalid" });
  });

  it("rejects redeem as recovery_token_invalid without registering a passkey or burning the token", async () => {
    const rawToken = await issueToken();
    const options = await getRegistrationOptions(rawToken);
    const credential = new WebAuthnEmulator().createJSON(BACKOFFICE_ORIGIN, options);
    await deactivateUser();

    const response = await postRedeem({
      recovery_token: rawToken,
      passkey_registration: credential,
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "recovery_token_invalid" });
    const insertedPasskeys = await db.select().from(passkeys).where(eq(passkeys.userId, userId));
    expect(insertedPasskeys).toHaveLength(0);
    expect(await tokenUsedAt(rawToken)).toBeNull();
  });
});

describe("recovery redemption with a credential that is already registered", () => {
  it("rejects it as validation_failed without burning the token", async () => {
    const rawToken = await issueToken();
    const options = await getRegistrationOptions(rawToken);
    const credential = new WebAuthnEmulator().createJSON(BACKOFFICE_ORIGIN, options);
    await registerCredentialAlready(credential.id);

    const response = await postRedeem({
      recovery_token: rawToken,
      passkey_registration: credential,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "validation_failed" });
    expect(await tokenUsedAt(rawToken)).toBeNull();
  });
});

describe("auditing rejected recovery redemptions", () => {
  it.each([
    ["an already-used token", { usedAt: NOON }, "recovery_token_burned"],
    ["an expired token", { expiresAt: new Date(NOON.getTime() - 1) }, "recovery_token_expired"],
  ] as const)(
    "audits registration-options and redeem for %s against the account",
    async (_, overrides, code) => {
      const rawToken = await issueToken(overrides);

      await postOptions({ recovery_token: rawToken });
      await postRedeem({ recovery_token: rawToken });

      const rows = await rejectedAttemptAuditRows();
      expect(rows).toHaveLength(2);
      for (const row of rows) {
        expect(row.actorId).toBe(userId);
        expect(row.newValue).toMatchObject({ rejectedWith: code });
      }
      expect(rows.map((row) => (row.newValue as { attempt: string }).attempt).sort()).toEqual([
        "redeem",
        "registration_options",
      ]);
    },
  );

  it("audits a redeem whose passkey registration does not verify", async () => {
    const rawTokenA = await issueToken();
    const optionsA = await getRegistrationOptions(rawTokenA);
    const rawTokenB = await issueToken();
    await getRegistrationOptions(rawTokenB);
    const credentialForA = new WebAuthnEmulator().createJSON(BACKOFFICE_ORIGIN, optionsA);

    await postRedeem({ recovery_token: rawTokenB, passkey_registration: credentialForA });

    const rows = await rejectedAttemptAuditRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actorId: userId,
      newValue: { attempt: "redeem", rejectedWith: "validation_failed" },
    });
  });

  it("audits a redeem attempted before registration options were requested", async () => {
    const rawToken = await issueToken();

    await postRedeem({ recovery_token: rawToken });

    const rows = await rejectedAttemptAuditRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.newValue).toMatchObject({ rejectedWith: "validation_failed" });
  });

  it("audits a redeem that is missing its passkey registration", async () => {
    const rawToken = await issueToken();
    await getRegistrationOptions(rawToken);

    await postRedeem({ recovery_token: rawToken });

    const rows = await rejectedAttemptAuditRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.newValue).toMatchObject({ rejectedWith: "validation_failed" });
  });

  it("audits a redeem with a credential that is already registered", async () => {
    const rawToken = await issueToken();
    const options = await getRegistrationOptions(rawToken);
    const credential = new WebAuthnEmulator().createJSON(BACKOFFICE_ORIGIN, options);
    await registerCredentialAlready(credential.id);

    await postRedeem({ recovery_token: rawToken, passkey_registration: credential });

    const rows = await rejectedAttemptAuditRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actorId: userId,
      newValue: { attempt: "redeem", rejectedWith: "validation_failed" },
    });
  });

  it("audits registration-options and redeem for a deactivated account", async () => {
    const rawToken = await issueToken();
    const options = await getRegistrationOptions(rawToken);
    const credential = new WebAuthnEmulator().createJSON(BACKOFFICE_ORIGIN, options);
    await deactivateUser();

    await postOptions({ recovery_token: rawToken });
    await postRedeem({ recovery_token: rawToken, passkey_registration: credential });

    const rows = await rejectedAttemptAuditRows();
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.actorId).toBe(userId);
      expect(row.newValue).toMatchObject({ rejectedWith: "recovery_token_invalid" });
    }
  });

  it("writes nothing for a token that matches no row, since there is no account to attribute it to", async () => {
    await postOptions({ recovery_token: "an-unknown-raw-token" });
    await postRedeem({ recovery_token: "an-unknown-raw-token" });

    await expect(db.select().from(auditLog)).resolves.toEqual([]);
  });

  describe("grouped audit of rate-limited rejections (H1)", () => {
    it("upserts the accumulator for a rate-limited registration-options/redeem attempt on a known token, without any individual audit row or a token lookup", async () => {
      const rawToken = await issueToken({ usedAt: NOON });
      for (let i = 0; i < 10; i++) {
        await postOptions({ recovery_token: "an-unknown-raw-token" });
      }

      const rateLimitedOptions = await postOptions({ recovery_token: rawToken });
      const rateLimitedRedeem = await postRedeem({ recovery_token: rawToken });

      expect(rateLimitedOptions.statusCode).toBe(429);
      expect(rateLimitedRedeem.statusCode).toBe(429);
      await expect(db.select().from(auditLog)).resolves.toEqual([]);
      const rows = await accumulatorRows();
      expect(
        rows.map((row) => ({ kind: row.kind, keyHash: row.keyHash, count: row.count })),
      ).toEqual(
        expect.arrayContaining([
          { kind: "registration_options", keyHash: hashRecoveryToken(rawToken), count: 1 },
          { kind: "redeem", keyHash: hashRecoveryToken(rawToken), count: 1 },
        ]),
      );
    });

    it("does the identical accumulator work for a rate-limited attempt on a token that matches no row", async () => {
      for (let i = 0; i < 10; i++) {
        await postOptions({ recovery_token: "an-unknown-raw-token" });
      }

      const rateLimitedOptions = await postOptions({ recovery_token: "another-unknown-raw-token" });
      const rateLimitedRedeem = await postRedeem({ recovery_token: "another-unknown-raw-token" });

      expect(rateLimitedOptions.statusCode).toBe(429);
      expect(rateLimitedRedeem.statusCode).toBe(429);
      await expect(db.select().from(auditLog)).resolves.toEqual([]);
      const rows = await accumulatorRows();
      expect(
        rows.map((row) => ({ kind: row.kind, keyHash: row.keyHash, count: row.count })),
      ).toEqual(
        expect.arrayContaining([
          {
            kind: "registration_options",
            keyHash: hashRecoveryToken("another-unknown-raw-token"),
            count: 1,
          },
          { kind: "redeem", keyHash: hashRecoveryToken("another-unknown-raw-token"), count: 1 },
        ]),
      );
    });

    it("records the rejected attempt at the same instant the rate limit was decided on", async () => {
      let ticks = 0;
      const ticking = () => new Date(NOON.getTime() + ticks++ * 1000);
      const tickingApp = Fastify();
      registerRecoveryRedemptionRoutes(tickingApp, {
        db,
        backofficeOrigin: BACKOFFICE_ORIGIN,
        now: ticking,
      });
      const postTicking = (rawToken: string) =>
        tickingApp.inject({
          method: "POST",
          url: "/users/recovery/redeem",
          headers: { origin: BACKOFFICE_ORIGIN, "x-real-ip": "203.0.113.10" },
          payload: { recovery_token: rawToken },
        });
      for (let i = 0; i < 10; i++) {
        await postTicking("an-unknown-raw-token");
      }
      const decidedAt = new Date(NOON.getTime() + ticks * 1000);

      const rateLimited = await postTicking("a-rate-limited-raw-token");

      expect(rateLimited.statusCode).toBe(429);
      const [row] = await db
        .select()
        .from(recoveryRejectedAttemptAccumulator)
        .where(
          eq(
            recoveryRejectedAttemptAccumulator.keyHash,
            hashRecoveryToken("a-rate-limited-raw-token"),
          ),
        );
      expect(row).toMatchObject({ firstAt: decidedAt, lastAt: decidedAt });

      await tickingApp.close();
    });

    it("writes nothing to the accumulator when the rejected request carries no token at all", async () => {
      for (let i = 0; i < 10; i++) {
        await postOptions({ recovery_token: "an-unknown-raw-token" });
      }

      const rateLimitedOptions = await postOptions({});

      expect(rateLimitedOptions.statusCode).toBe(429);
      await expect(accumulatorRows()).resolves.toEqual([]);
    });
  });

  describe("bookkeeping failures never block the 429 response (H2)", () => {
    it("still answers 429 with Retry-After when recording the rejected attempt fails", async () => {
      for (let i = 0; i < 10; i++) {
        await postOptions({ recovery_token: "an-unknown-raw-token" });
      }
      const reportError = vi.fn();
      const failingApp = Fastify();
      registerRecoveryRedemptionRoutes(failingApp, {
        db,
        backofficeOrigin: BACKOFFICE_ORIGIN,
        now: () => currentTime,
        recordRejectedAttempt: vi.fn().mockRejectedValue(new Error("accumulator write failed")),
        reportError,
      });

      const response = await failingApp.inject({
        method: "POST",
        url: "/users/recovery/registration-options",
        headers: { origin: BACKOFFICE_ORIGIN, "x-real-ip": "203.0.113.10" },
        payload: { recovery_token: "an-unknown-raw-token" },
      });

      expect(response.statusCode).toBe(429);
      expect(response.json()).toMatchObject({ code: "rate_limited" });
      expect(response.headers["retry-after"]).toBeDefined();
      expect(reportError).toHaveBeenCalledWith(expect.any(Error));

      await failingApp.close();
    });
  });
});

async function accumulatorRows() {
  return db.select().from(recoveryRejectedAttemptAccumulator);
}
