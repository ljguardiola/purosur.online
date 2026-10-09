import { permissionCatalogSchema } from "@purosur/contracts";
import { PERMISSION_AREAS, PERMISSION_CATALOG, PERMISSION_KEYS } from "@purosur/domain";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sessions, users } from "../platform/db/schema.js";
import { SESSION_COOKIE_NAME } from "../sessions/session-cookie.js";
import { generateSessionId, hashSessionId } from "../sessions/session-id.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { registerPermissionCatalogRoute } from "./permission-catalog-route.js";

const BACKOFFICE_ORIGIN = "https://staging.purosur.online";
const NOON = new Date("2026-01-05T12:00:00.000Z");

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let app: FastifyInstance;
let userId: string;

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();

  const [user] = await db
    .insert(users)
    .values({
      firstName: "Ana",
      email: "ana@example.com",
      locationId: await seededLocationId(db),
    })
    .returning({ id: users.id });
  if (!user) {
    throw new Error("test setup: seeding the user returned no row");
  }
  userId = user.id;

  app = Fastify();
  registerPermissionCatalogRoute(app, {
    db,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    now: () => NOON,
  });
});

afterEach(async () => {
  await app.close();
});

async function insertSession(revokedAt?: Date): Promise<string> {
  const rawSessionId = generateSessionId();
  await db.insert(sessions).values({
    userId,
    sessionIdHash: hashSessionId(rawSessionId),
    createdAt: NOON,
    lastSeenAt: NOON,
    ...(revokedAt ? { revokedAt } : {}),
  });
  return rawSessionId;
}

function getPermissionCatalog(rawSessionId?: string) {
  return app.inject({
    method: "GET",
    url: "/permission-catalog",
    headers: rawSessionId ? { cookie: `${SESSION_COOKIE_NAME}=${rawSessionId}` } : {},
  });
}

describe("GET /permission-catalog", () => {
  it("returns 401 unauthenticated when no cookie was sent", async () => {
    const response = await getPermissionCatalog();

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("returns 401 unauthenticated when the session was revoked", async () => {
    const rawSessionId = await insertSession(NOON);

    const response = await getPermissionCatalog(rawSessionId);

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("answers any signed-in user, not only an Administrator, with a body the contracts shape accepts", async () => {
    const rawSessionId = await insertSession();

    const response = await getPermissionCatalog(rawSessionId);

    expect(response.statusCode).toBe(200);
    expect(permissionCatalogSchema.safeParse(response.json()).success).toBe(true);
  });

  it("lists the areas in the domain's order, each with its permissions in the domain's order", async () => {
    const rawSessionId = await insertSession();

    const response = await getPermissionCatalog(rawSessionId);

    const areas = response.json<{ area: string; permissions: { key: string }[] }[]>();
    expect(areas.map(({ area }) => area)).toEqual([...PERMISSION_AREAS]);
    for (const { area, permissions } of areas) {
      expect(permissions.map(({ key }) => key)).toEqual(
        PERMISSION_CATALOG.filter((definition) => definition.area === area).map(({ key }) => key),
      );
    }
    expect(areas.flatMap(({ permissions }) => permissions.map(({ key }) => key))).toEqual([
      ...PERMISSION_KEYS,
    ]);
  });

  it("gives each permission its register marker", async () => {
    const rawSessionId = await insertSession();

    const response = await getPermissionCatalog(rawSessionId);

    const markers = response
      .json<{ permissions: { key: string; register_marker: string }[] }[]>()
      .flatMap(({ permissions }) => permissions);
    expect(markers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "sell_and_charge", register_marker: "register" }),
        expect.objectContaining({
          key: "void_sale",
          register_marker: "register_with_another_persons_pin",
        }),
        expect.objectContaining({ key: "adjust_stock", register_marker: "none" }),
      ]),
    );
    expect(markers.map(({ register_marker }) => register_marker)).toEqual(
      PERMISSION_CATALOG.map(({ registerMarker }) => registerMarker),
    );
  });

  it("gives each permission the permissions it requires, none for one that requires nothing", async () => {
    const rawSessionId = await insertSession();

    const response = await getPermissionCatalog(rawSessionId);

    const stock = response
      .json<{ area: string; permissions: { key: string; requires: string[] }[] }[]>()
      .find(({ area }) => area === "stock");
    expect(stock?.permissions).toEqual([
      expect.objectContaining({ key: "record_initial_inventory", requires: [] }),
      expect.objectContaining({ key: "view_stock_balances", requires: [] }),
      expect.objectContaining({ key: "perform_stock_counts", requires: ["view_stock_balances"] }),
      expect.objectContaining({ key: "adjust_stock", requires: ["view_stock_balances"] }),
      expect.objectContaining({ key: "record_stock_losses", requires: ["view_stock_balances"] }),
    ]);
  });

  it("gives each permission every permission that requires it, none for one nothing requires", async () => {
    const rawSessionId = await insertSession();

    const response = await getPermissionCatalog(rawSessionId);

    const stock = response
      .json<{ area: string; permissions: { key: string; required_by: string[] }[] }[]>()
      .find(({ area }) => area === "stock");
    expect(stock?.permissions).toEqual([
      expect.objectContaining({ key: "record_initial_inventory", required_by: [] }),
      expect.objectContaining({
        key: "view_stock_balances",
        required_by: ["perform_stock_counts", "adjust_stock", "record_stock_losses"],
      }),
      expect.objectContaining({ key: "perform_stock_counts", required_by: [] }),
      expect.objectContaining({ key: "adjust_stock", required_by: [] }),
      expect.objectContaining({ key: "record_stock_losses", required_by: [] }),
    ]);
  });

  it("rejects an Origin that is not the backoffice's own", async () => {
    const rawSessionId = await insertSession();

    const response = await app.inject({
      method: "GET",
      url: "/permission-catalog",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${rawSessionId}`,
        origin: "https://attacker.example",
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });
});
