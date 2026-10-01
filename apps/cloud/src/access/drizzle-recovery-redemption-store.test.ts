import { PasskeyAlreadyRegistered } from "@purosur/domain/access/use-cases";
import { and, asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  alerts,
  auditLog,
  passkeys,
  recoveryTokens,
  sessions,
  users,
} from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleRecoveryRedemptionStore } from "./drizzle-recovery-redemption-store.js";

const ISSUED_AT = new Date("2026-10-01T12:00:00.000Z");
const EXPIRES_AT = new Date("2026-10-01T12:15:00.000Z");
const BEFORE_EXPIRY = new Date("2026-10-01T12:14:59.999Z");

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let userId: string;
let tokenId: string;

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

async function insertUser(firstName: string, email: string, active = true): Promise<string> {
  const [row] = await db
    .insert(users)
    .values({ firstName, email, active, locationId: await seededLocationId(db) })
    .returning({ id: users.id });
  if (!row) {
    throw new Error("test setup: seeding the user returned no row");
  }
  return row.id;
}

async function insertToken(overrides: Partial<typeof recoveryTokens.$inferInsert> = {}) {
  const [row] = await db
    .insert(recoveryTokens)
    .values({
      userId,
      tokenHash: "hash-1",
      issuedAt: ISSUED_AT,
      expiresAt: EXPIRES_AT,
      ...overrides,
    })
    .returning({ id: recoveryTokens.id });
  if (!row) {
    throw new Error("test setup: seeding the token returned no row");
  }
  return row.id;
}

beforeEach(async () => {
  await testDatabase.clear();
  userId = await insertUser("Ada", "ada@example.com");
  tokenId = await insertToken();
});

const store = () => new DrizzleRecoveryRedemptionStore(db);

function recoveredPasskey(overrides: Record<string, unknown> = {}) {
  return {
    userId,
    credentialId: "credential-1",
    publicKey: "public-key",
    counter: 7,
    transports: ["internal"],
    deviceType: "multiDevice",
    backedUp: true,
    name: "Laptop",
    ...overrides,
  };
}

describe("finding a token by its hash", () => {
  it("answers the token's state and registration challenge", async () => {
    await db
      .update(recoveryTokens)
      .set({ registrationChallenge: "challenge-1", usedAt: ISSUED_AT })
      .where(eq(recoveryTokens.id, tokenId));

    expect(await store().findTokenByHash("hash-1")).toEqual({
      id: tokenId,
      userId,
      expiresAt: EXPIRES_AT,
      usedAt: ISSUED_AT,
      voidedAt: null,
      registrationChallenge: "challenge-1",
    });
  });

  it("answers nothing for an unknown hash", async () => {
    expect(await store().findTokenByHash("unknown-hash")).toBeUndefined();
  });
});

describe("finding the recovering account", () => {
  it("answers its name, email and whether it is active", async () => {
    expect(await store().findAccount(userId)).toEqual({
      id: userId,
      firstName: "Ada",
      email: "ada@example.com",
      active: true,
    });
  });

  it("answers an inactive account as inactive", async () => {
    const inactive = await insertUser("Beto", "beto@example.com", false);

    expect(await store().findAccount(inactive)).toMatchObject({ id: inactive, active: false });
  });

  it("answers nothing for an unknown account", async () => {
    expect(await store().findAccount("6f1b1c7e-0000-4000-8000-0000000000ff")).toBeUndefined();
  });
});

describe("listing the registered credentials", () => {
  it("answers the credential ids and transports of the user's passkeys only", async () => {
    const other = await insertUser("Beto", "beto@example.com");
    await db
      .insert(passkeys)
      .values([
        { ...recoveredPasskey({ credentialId: "mine-usb", transports: ["usb"] }) },
        { ...recoveredPasskey({ credentialId: "mine-none", transports: null }) },
        { ...recoveredPasskey({ credentialId: "theirs", userId: other }) },
      ]);

    const credentials = await store().listRegisteredCredentials(userId);

    expect(credentials).toHaveLength(2);
    expect(credentials).toEqual(
      expect.arrayContaining([
        { credentialId: "mine-usb", transports: ["usb"] },
        { credentialId: "mine-none", transports: null },
      ]),
    );
  });
});

describe("recording the registration challenge", () => {
  it("stores the challenge on the token", async () => {
    await store().recordRegistrationChallenge(tokenId, "challenge-2");

    const [row] = await db
      .select({ challenge: recoveryTokens.registrationChallenge })
      .from(recoveryTokens);
    expect(row?.challenge).toBe("challenge-2");
  });
});

describe("recording a rejected redemption", () => {
  it("audits the attempt on the token by the account that owns it", async () => {
    await store().recordRejectedRedemption({
      tokenId,
      userId,
      attempt: "redeem",
      rejectedWith: "validation_failed",
    });

    const [row] = await db.select().from(auditLog);
    expect(row).toMatchObject({
      entity: "recovery_token",
      entityId: tokenId,
      actorId: userId,
      previousValue: null,
      newValue: { attempt: "redeem", rejectedWith: "validation_failed" },
    });
  });

  it.each([
    ["invalid", "recovery_token_invalid"],
    ["burned", "recovery_token_burned"],
    ["expired", "recovery_token_expired"],
    ["passkey_already_registered", "passkey_already_registered"],
  ] as const)("writes a %s rejection as %s", async (rejectedWith, written) => {
    await store().recordRejectedRedemption({
      tokenId,
      userId,
      attempt: "registration_options",
      rejectedWith,
    });

    const [row] = await db.select().from(auditLog);
    expect(row?.newValue).toEqual({ attempt: "registration_options", rejectedWith: written });
  });
});

describe("locking a token", () => {
  it("answers the token as it is stored", async () => {
    const usedAt = new Date("2026-10-01T12:05:00.000Z");
    await db.update(recoveryTokens).set({ usedAt, registrationChallenge: "challenge-1" });

    expect(await store().transaction((tx) => tx.lockToken(tokenId))).toEqual({
      id: tokenId,
      userId,
      expiresAt: EXPIRES_AT,
      usedAt,
      voidedAt: null,
      registrationChallenge: "challenge-1",
    });
  });

  it("answers nothing for an unknown token", async () => {
    const unknown = "6f1b1c7e-0000-4000-8000-0000000000ff";

    expect(await store().transaction((tx) => tx.lockToken(unknown))).toBeUndefined();
  });
});

describe("marking a token used", () => {
  it("stores the time it was used", async () => {
    await store().transaction((tx) => tx.markTokenUsed(tokenId, BEFORE_EXPIRY));

    const [row] = await db.select({ usedAt: recoveryTokens.usedAt }).from(recoveryTokens);
    expect(row?.usedAt).toEqual(BEFORE_EXPIRY);
  });
});

describe("registering a passkey", () => {
  it("stores the passkey for the user and answers its id", async () => {
    const registered = await store().transaction((tx) => tx.registerPasskey(recoveredPasskey()));

    const [row] = await db.select().from(passkeys);
    expect(registered).toEqual({ id: row?.id });
    expect(row).toMatchObject({
      userId,
      credentialId: "credential-1",
      publicKey: "public-key",
      counter: 7,
      transports: ["internal"],
      deviceType: "multiDevice",
      backedUp: true,
      name: "Laptop",
    });
  });

  it("raises PasskeyAlreadyRegistered when another passkey holds the credential", async () => {
    const other = await insertUser("Beto", "beto@example.com");
    await db.insert(passkeys).values(recoveredPasskey({ userId: other }));

    await expect(
      store().transaction((tx) => tx.registerPasskey(recoveredPasskey())),
    ).rejects.toBeInstanceOf(PasskeyAlreadyRegistered);
  });

  it("keeps the transaction usable after the conflict", async () => {
    await db.insert(passkeys).values(recoveredPasskey());

    const outcome = await store().transaction(async (tx) => {
      await tx.registerPasskey(recoveredPasskey()).catch(() => undefined);
      return tx.lockToken(tokenId);
    });

    expect(outcome?.id).toBe(tokenId);
  });
});

describe("recording what was redeemed", () => {
  it("audits the token as used, by the account, at the redemption time", async () => {
    await store().transaction((tx) => tx.recordTokenRedeemed(tokenId, userId, BEFORE_EXPIRY));

    const [row] = await db.select().from(auditLog).where(eq(auditLog.entity, "recovery_token"));
    expect(row).toMatchObject({
      entityId: tokenId,
      actorId: userId,
      previousValue: null,
      newValue: { usedAt: BEFORE_EXPIRY.toISOString() },
    });
  });

  it("audits the registered passkey with its identifying details", async () => {
    await store().transaction(async (tx) => {
      const details = recoveredPasskey();
      const registered = await tx.registerPasskey(details);
      await tx.recordPasskeyRegistered(userId, registered, details);
    });

    const [passkey] = await db.select({ id: passkeys.id }).from(passkeys);
    const [row] = await db.select().from(auditLog).where(eq(auditLog.entity, "passkey"));
    expect(row).toMatchObject({
      entityId: passkey?.id,
      actorId: userId,
      previousValue: null,
      newValue: {
        id: passkey?.id,
        name: "Laptop",
        credentialId: "credential-1",
        deviceType: "multiDevice",
        backedUp: true,
      },
    });
  });
});

describe("opening the passkey-registered alert", () => {
  it("opens one for the user, marked as registered through recovery, dated at the redemption", async () => {
    await store().transaction((tx) =>
      tx.openPasskeyRegisteredAlert({ userId, passkeyName: "Laptop", openedAt: BEFORE_EXPIRY }),
    );

    const rows = await db
      .select()
      .from(alerts)
      .where(and(eq(alerts.kind, "backoffice_passkey_changed"), eq(alerts.scope, userId)));
    expect(rows).toEqual([
      expect.objectContaining({
        detail: { action: "registered", passkeyName: "Laptop", actorId: userId, via: "recovery" },
        openedAt: BEFORE_EXPIRY,
      }),
    ]);
  });
});

describe("revoking sessions", () => {
  it("revokes only the live sessions of the given user", async () => {
    const other = await insertUser("Beto", "beto@example.com");
    await db.insert(sessions).values([
      { userId, sessionIdHash: "live" },
      { userId, sessionIdHash: "revoked-before", revokedAt: ISSUED_AT },
      { userId: other, sessionIdHash: "someone-else" },
    ]);

    await store().transaction((tx) => tx.revokeSessions(userId, BEFORE_EXPIRY));

    const rows = await db
      .select({ hash: sessions.sessionIdHash, revokedAt: sessions.revokedAt })
      .from(sessions)
      .orderBy(asc(sessions.sessionIdHash));
    expect(rows).toEqual([
      { hash: "live", revokedAt: BEFORE_EXPIRY },
      { hash: "revoked-before", revokedAt: ISSUED_AT },
      { hash: "someone-else", revokedAt: null },
    ]);
  });
});

describe("the transaction", () => {
  it("rolls the burn back when a later write throws", async () => {
    await expect(
      store().transaction(async (tx) => {
        await tx.markTokenUsed(tokenId, BEFORE_EXPIRY);
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    const [row] = await db.select({ usedAt: recoveryTokens.usedAt }).from(recoveryTokens);
    expect(row?.usedAt).toBeNull();
  });
});
