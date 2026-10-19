import { compromiseResponseSchema } from "@purosur/contracts";
import { COMPROMISE_RESPONSE_ITEMS, EXTERNAL_SECRET_ITEMS } from "@purosur/domain";
import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  auditLog,
  compromiseResponseCompletions,
  compromiseResponses,
  passkeys,
  registerInstallations,
  roles,
  sessions,
  userPins,
  userRoles,
  users,
} from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { insertFirstKeys } from "../register/test-support/lost-register-revocation-fixtures.js";
import {
  BACKOFFICE_ORIGIN,
  openBackofficeSession,
  SESSION_NOON,
} from "../test-support/backoffice-session.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { TEST_INSTALLATION_KEYS_ENCRYPTION_KEY } from "../test-support/installation-keys-encryption-key.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { registerCompromiseResponseRoutes } from "./compromise-response-route.js";
import { SESSION_COOKIE_NAME } from "./session-cookie.js";

const STEP_URLS = {
  revoke: "/compromise-responses/current/steps/revoke-every-installation",
  sessionsAndPasskeys: "/compromise-responses/current/steps/end-sessions-and-remove-passkeys",
  pinResets: "/compromise-responses/current/steps/force-pin-resets",
} as const;

const EARLIER = new Date("2026-01-05T10:00:00.000Z");

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let app: FastifyInstance;
let locationId: string;

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
  locationId = await seededLocationId(db);
  app = Fastify();
  registerCompromiseResponseRoutes(app, {
    db,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    keysEncryptionKey: TEST_INSTALLATION_KEYS_ENCRYPTION_KEY,
    now: () => SESSION_NOON,
  });
});

afterEach(async () => {
  await app.close();
});

async function openAdministratorSession(options: { passkeyAuthorized?: boolean } = {}) {
  const session = await openBackofficeSession(db, {
    now: SESSION_NOON,
    locationId,
    permissionKeys: [],
    email: "ada@example.com",
    ...options,
  });
  const [administratorRole] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.isAdministrator, true));
  await db
    .update(userRoles)
    .set({ roleId: administratorRole?.id as string })
    .where(eq(userRoles.userId, session.userId));
  return session;
}

async function insertUser(firstName: string, withPin = true): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({ firstName, email: `${firstName.toLowerCase()}@example.test`, locationId })
    .returning({ id: users.id });
  const id = user?.id as string;
  if (withPin) {
    await db.insert(userPins).values({ userId: id, salt: "salt", hash: "hash", setAt: EARLIER });
  }
  return id;
}

async function insertPasskey(userId: string): Promise<void> {
  await db.insert(passkeys).values({
    userId,
    credentialId: `credential-${userId}`,
    publicKey: "key",
    counter: 0,
    deviceType: "singleDevice",
    backedUp: false,
    name: "Llave",
  });
}

async function seedRunbook(done: string[] = []): Promise<string> {
  const [admin] = await db.select({ id: users.id }).from(users).limit(1);
  const [response] = await db
    .insert(compromiseResponses)
    .values({ startedAt: EARLIER, startedBy: admin?.id as string })
    .returning({ id: compromiseResponses.id });
  const responseId = response?.id as string;
  for (const key of done) {
    await db
      .insert(compromiseResponseCompletions)
      .values({ responseId, key, doneBy: admin?.id as string, doneAt: EARLIER });
  }
  return responseId;
}

function post(url: string, headers: Record<string, string>, payload?: Record<string, unknown>) {
  return app.inject({ method: "POST", url, headers, ...(payload ? { payload } : {}) });
}

function completionKeys(): Promise<string[]> {
  return db
    .select({ key: compromiseResponseCompletions.key })
    .from(compromiseResponseCompletions)
    .then((rows) => rows.map(({ key }) => key).sort());
}

const ROUTES = [
  { method: "POST", url: "/compromise-responses", payload: undefined },
  { method: "GET", url: "/compromise-responses/current", payload: undefined },
  { method: "POST", url: STEP_URLS.revoke, payload: undefined },
  {
    method: "POST",
    url: STEP_URLS.sessionsAndPasskeys,
    payload: { account_id: "3f2b8c1e-9a4d-4e7b-8c55-0d1e2f3a4b5c" },
  },
  { method: "POST", url: STEP_URLS.pinResets, payload: undefined },
  { method: "POST", url: "/compromise-responses/current/items/notify", payload: undefined },
] as const;

describe.each(ROUTES)("$method $url access", ({ method, url, payload }) => {
  it("returns 401 unauthenticated when no cookie was sent", async () => {
    const response = await app.inject({
      method,
      url,
      headers: { origin: BACKOFFICE_ORIGIN },
      ...(payload ? { payload } : {}),
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("returns 403 forbidden to a user without manage_users, changing nothing", async () => {
    const cashier = await openBackofficeSession(db, {
      now: SESSION_NOON,
      locationId,
      permissionKeys: ["sell_and_charge"],
    });

    const response = await app.inject({
      method,
      url,
      headers: cashier.headers,
      ...(payload ? { payload } : {}),
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
    expect(await db.select().from(compromiseResponses)).toEqual([]);
  });
});

describe.each(ROUTES.filter(({ method }) => method === "POST"))(
  "$method $url origin",
  ({ url, payload }) => {
    it("rejects an Origin that is not the backoffice's own", async () => {
      const administrator = await openAdministratorSession();

      const response = await app.inject({
        method: "POST",
        url,
        headers: { ...administrator.headers, origin: "https://evil.example" },
        ...(payload ? { payload } : {}),
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ code: "origin_rejected" });
    });
  },
);

describe("POST /compromise-responses", () => {
  it("starts a runbook with the six steps in order, answering 201 and auditing the start", async () => {
    const administrator = await openAdministratorSession();

    const response = await post("/compromise-responses", administrator.headers);

    expect(response.statusCode).toBe(201);
    const body = compromiseResponseSchema.parse(response.json());
    expect(body.steps.map(({ step }) => step)).toEqual([
      "revoke_every_installation",
      "end_sessions_and_remove_passkeys",
      "force_pin_resets",
      "rotate_external_secrets",
      "notify",
      "re_enroll_registers",
    ]);
    expect(body.started_by).toBe(administrator.userId);
    expect(body.started_at).toBe(SESSION_NOON.toISOString());
    expect(body.items.map(({ item }) => item)).toEqual([...COMPROMISE_RESPONSE_ITEMS]);
    expect(
      await db
        .select({ actorId: auditLog.actorId, entityId: auditLog.entityId })
        .from(auditLog)
        .where(eq(auditLog.entity, "compromise_response")),
    ).toEqual([{ actorId: administrator.userId, entityId: body.id }]);
  });

  it("answers 200 with the runbook already running instead of starting another", async () => {
    const administrator = await openAdministratorSession();
    const first = await post("/compromise-responses", administrator.headers);

    const second = await post("/compromise-responses", administrator.headers);

    expect(second.statusCode).toBe(200);
    expect(second.json()).toEqual(first.json());
    expect(await db.select().from(compromiseResponses)).toHaveLength(1);
  });
});

describe("GET /compromise-responses/current", () => {
  it("answers 404 not_found before any runbook was started", async () => {
    const administrator = await openAdministratorSession();

    const response = await app.inject({
      method: "GET",
      url: "/compromise-responses/current",
      headers: administrator.headers,
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "not_found" });
  });

  it("shows the runbook with what is done and what is available", async () => {
    const administrator = await openAdministratorSession();
    await seedRunbook(["revoke_every_installation"]);

    const response = await app.inject({
      method: "GET",
      url: "/compromise-responses/current",
      headers: administrator.headers,
    });

    expect(response.statusCode).toBe(200);
    const body = compromiseResponseSchema.parse(response.json());
    expect(body.completed).toBe(false);
    expect(body.steps.slice(0, 3)).toEqual([
      {
        step: "revoke_every_installation",
        done: true,
        done_at: EARLIER.toISOString(),
        available: false,
      },
      { step: "end_sessions_and_remove_passkeys", done: false, done_at: null, available: true },
      { step: "force_pin_resets", done: false, done_at: null, available: false },
    ]);
  });
});

describe("POST .../steps/revoke-every-installation", () => {
  it("answers 409 no_running_response when no runbook was started", async () => {
    const administrator = await openAdministratorSession();

    const response = await post(STEP_URLS.revoke, administrator.headers);

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "no_running_response" });
  });

  it("refuses without a fresh passkey authorization, before touching any data", async () => {
    const administrator = await openAdministratorSession({ passkeyAuthorized: false });
    await seedRunbook();

    const response = await post(STEP_URLS.revoke, administrator.headers);

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "authorization_required" });
    expect(await completionKeys()).toEqual([]);
  });

  it("revokes every installation in service and records the step with who and when", async () => {
    const administrator = await openAdministratorSession();
    const installation = await insertEnrolledInstallation(db, { now: SESSION_NOON });
    await insertFirstKeys(db, installation.registerId);
    await seedRunbook();

    const response = await post(STEP_URLS.revoke, administrator.headers);

    expect(response.statusCode).toBe(200);
    const body = compromiseResponseSchema.parse(response.json());
    expect(body.steps[0]).toEqual({
      step: "revoke_every_installation",
      done: true,
      done_at: SESSION_NOON.toISOString(),
      available: false,
    });
    expect(
      await db.select({ revokedAt: registerInstallations.revokedAt }).from(registerInstallations),
    ).toEqual([{ revokedAt: SESSION_NOON }]);
    expect(
      (await db.select().from(auditLog).where(eq(auditLog.entity, "compromise_response"))).map(
        ({ actorId, newValue }) => ({ actorId, newValue }),
      ),
    ).toEqual([
      {
        actorId: administrator.userId,
        newValue: { step: "revoke_every_installation", done_at: SESSION_NOON.toISOString() },
      },
    ]);
  });

  it("completes the step as well when no installation is in service", async () => {
    const administrator = await openAdministratorSession();
    await seedRunbook();

    const response = await post(STEP_URLS.revoke, administrator.headers);

    expect(response.statusCode).toBe(200);
    expect(await completionKeys()).toEqual(["revoke_every_installation"]);
  });

  it("answers 409 already_done when the step was already done", async () => {
    const administrator = await openAdministratorSession();
    await seedRunbook(["revoke_every_installation"]);

    const response = await post(STEP_URLS.revoke, administrator.headers);

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "already_done" });
  });
});

describe("POST .../steps/end-sessions-and-remove-passkeys", () => {
  it("answers 400 validation_failed when the account id is missing or malformed", async () => {
    const administrator = await openAdministratorSession();
    await seedRunbook(["revoke_every_installation"]);

    for (const payload of [{}, { account_id: "not-an-id" }]) {
      const response = await post(STEP_URLS.sessionsAndPasskeys, administrator.headers, payload);

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({
        code: "validation_failed",
        details: [{ field: "account_id" }],
      });
    }
  });

  it("refuses without a fresh passkey authorization, before touching any data", async () => {
    const administrator = await openAdministratorSession({ passkeyAuthorized: false });
    const suspect = await insertUser("Bea");
    await seedRunbook(["revoke_every_installation"]);

    const response = await post(STEP_URLS.sessionsAndPasskeys, administrator.headers, {
      account_id: suspect,
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "authorization_required" });
  });

  it("answers 409 out_of_order, touching nothing, while the installations are not revoked", async () => {
    const administrator = await openAdministratorSession();
    const suspect = await insertUser("Bea");
    await insertPasskey(suspect);
    await seedRunbook();

    const response = await post(STEP_URLS.sessionsAndPasskeys, administrator.headers, {
      account_id: suspect,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "out_of_order" });
    expect(await db.select().from(passkeys)).toHaveLength(1);
    const open = await db.select({ revokedAt: sessions.revokedAt }).from(sessions);
    expect(open.every(({ revokedAt }) => revokedAt === null)).toBe(true);
  });

  it("removes the chosen account's passkeys, ends every session and clears the caller's cookie", async () => {
    const administrator = await openAdministratorSession();
    const suspect = await insertUser("Bea");
    const bystander = await insertUser("Caro");
    await insertPasskey(suspect);
    await insertPasskey(bystander);
    await seedRunbook(["revoke_every_installation"]);

    const response = await post(STEP_URLS.sessionsAndPasskeys, administrator.headers, {
      account_id: suspect,
    });

    expect(response.statusCode).toBe(200);
    const body = compromiseResponseSchema.parse(response.json());
    expect(body.steps[1]).toMatchObject({
      step: "end_sessions_and_remove_passkeys",
      done: true,
      done_at: SESSION_NOON.toISOString(),
    });
    expect(await db.select({ userId: passkeys.userId }).from(passkeys)).toEqual([
      { userId: bystander },
    ]);
    const stored = await db.select({ revokedAt: sessions.revokedAt }).from(sessions);
    expect(stored.length).toBeGreaterThan(0);
    expect(stored.every(({ revokedAt }) => revokedAt?.getTime() === SESSION_NOON.getTime())).toBe(
      true,
    );
    const setCookie = String(response.headers["set-cookie"]);
    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=;`);
    expect(setCookie).toContain("Max-Age=0");
    expect(await completionKeys()).toEqual([
      "end_sessions_and_remove_passkeys",
      "revoke_every_installation",
    ]);
  });

  it("completes the step as well when the chosen account has no passkeys left", async () => {
    const administrator = await openAdministratorSession();
    const suspect = await insertUser("Bea");
    await seedRunbook(["revoke_every_installation"]);

    const response = await post(STEP_URLS.sessionsAndPasskeys, administrator.headers, {
      account_id: suspect,
    });

    expect(response.statusCode).toBe(200);
    expect(await completionKeys()).toContain("end_sessions_and_remove_passkeys");
  });

  it("answers 404 not_found for an account that is not a user of the branch, leaving the step undone and the sessions open", async () => {
    const administrator = await openAdministratorSession();
    await seedRunbook(["revoke_every_installation"]);

    const response = await post(STEP_URLS.sessionsAndPasskeys, administrator.headers, {
      account_id: "7d9b1f0e-3c52-4a8e-9d41-0b6f2e8a5c13",
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "not_found" });
    expect(await completionKeys()).toEqual(["revoke_every_installation"]);
    expect(response.headers["set-cookie"]).toBeUndefined();
    const stored = await db.select({ revokedAt: sessions.revokedAt }).from(sessions);
    expect(stored.every(({ revokedAt }) => revokedAt === null)).toBe(true);
  });

  it("answers 403 own_account when the Administrator names their own account", async () => {
    const administrator = await openAdministratorSession();
    await seedRunbook(["revoke_every_installation"]);

    const response = await post(STEP_URLS.sessionsAndPasskeys, administrator.headers, {
      account_id: administrator.userId,
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "own_account" });
    expect(await completionKeys()).toEqual(["revoke_every_installation"]);
  });
});

describe("POST .../steps/force-pin-resets", () => {
  it("refuses without a fresh passkey authorization, before touching any data", async () => {
    const administrator = await openAdministratorSession({ passkeyAuthorized: false });
    await seedRunbook(["revoke_every_installation", "end_sessions_and_remove_passkeys"]);

    const response = await post(STEP_URLS.pinResets, administrator.headers);

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "authorization_required" });
  });

  it("answers 409 out_of_order while the earlier steps are not done", async () => {
    const administrator = await openAdministratorSession();
    const holder = await insertUser("Bea");
    await seedRunbook(["revoke_every_installation"]);

    const response = await post(STEP_URLS.pinResets, administrator.headers);

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "out_of_order" });
    expect(await db.select().from(userPins).where(eq(userPins.userId, holder))).toHaveLength(1);
  });

  it("removes the PIN of every user and records the step with who and when", async () => {
    const administrator = await openAdministratorSession();
    await insertUser("Bea");
    await insertUser("Caro", false);
    await seedRunbook(["revoke_every_installation", "end_sessions_and_remove_passkeys"]);

    const response = await post(STEP_URLS.pinResets, administrator.headers);

    expect(response.statusCode).toBe(200);
    const body = compromiseResponseSchema.parse(response.json());
    expect(body.steps[2]).toMatchObject({
      step: "force_pin_resets",
      done: true,
      done_at: SESSION_NOON.toISOString(),
    });
    expect(await db.select().from(userPins)).toEqual([]);
    expect(
      (
        await db
          .select({ newValue: auditLog.newValue })
          .from(auditLog)
          .where(eq(auditLog.entity, "user"))
      ).map(({ newValue }) => newValue),
    ).toEqual([{ pin_reset_required_by: "compromise_response" }]);
  });
});

describe("POST .../items/:item", () => {
  const EVERY_ACTION = [
    "revoke_every_installation",
    "end_sessions_and_remove_passkeys",
    "force_pin_resets",
  ];

  it("answers 400 validation_failed for an item the runbook does not have", async () => {
    const administrator = await openAdministratorSession();
    await seedRunbook(EVERY_ACTION);

    const response = await post(
      "/compromise-responses/current/items/wifi-password",
      administrator.headers,
    );

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "item" }],
    });
  });

  it("answers 409 no_running_response when no runbook was started", async () => {
    const administrator = await openAdministratorSession();

    const response = await post(
      "/compromise-responses/current/items/claude_api_key",
      administrator.headers,
    );

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "no_running_response" });
  });

  it("answers 409 out_of_order while the three actions are not all done", async () => {
    const administrator = await openAdministratorSession();
    await seedRunbook(["revoke_every_installation"]);

    const response = await post(
      "/compromise-responses/current/items/claude_api_key",
      administrator.headers,
    );

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "out_of_order" });
  });

  it("marks a secret as rotated, recording who and when, with no passkey authorization needed", async () => {
    const administrator = await openAdministratorSession({ passkeyAuthorized: false });
    await seedRunbook(EVERY_ACTION);

    const response = await post(
      "/compromise-responses/current/items/claude_api_key",
      administrator.headers,
    );

    expect(response.statusCode).toBe(200);
    const body = compromiseResponseSchema.parse(response.json());
    expect(body.items.find(({ item }) => item === "claude_api_key")).toEqual({
      item: "claude_api_key",
      step: "rotate_external_secrets",
      done: true,
      done_at: SESSION_NOON.toISOString(),
    });
    expect(
      (await db.select().from(auditLog).where(eq(auditLog.entity, "compromise_response"))).map(
        ({ actorId, newValue }) => ({ actorId, newValue }),
      ),
    ).toEqual([
      {
        actorId: administrator.userId,
        newValue: { item: "claude_api_key", done_at: SESSION_NOON.toISOString() },
      },
    ]);
  });

  it("answers 409 already_done for an item already marked", async () => {
    const administrator = await openAdministratorSession();
    await seedRunbook([...EVERY_ACTION, "claude_api_key"]);

    const response = await post(
      "/compromise-responses/current/items/claude_api_key",
      administrator.headers,
    );

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "already_done" });
  });

  it("completes the runbook with the notification, making the re-enrollment pointer available", async () => {
    const administrator = await openAdministratorSession();
    await seedRunbook([...EVERY_ACTION, ...EXTERNAL_SECRET_ITEMS]);

    const response = await post(
      "/compromise-responses/current/items/notify",
      administrator.headers,
    );

    expect(response.statusCode).toBe(200);
    const body = compromiseResponseSchema.parse(response.json());
    expect(body.completed).toBe(true);
    expect(body.steps.at(-1)).toEqual({
      step: "re_enroll_registers",
      done: false,
      done_at: null,
      available: true,
    });
    const next = await post(
      "/compromise-responses/current/items/claude_api_key",
      administrator.headers,
    );
    expect(next.statusCode).toBe(409);
    expect(next.json()).toMatchObject({ code: "no_running_response" });
  });
});
