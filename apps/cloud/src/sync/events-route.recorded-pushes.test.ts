import { fileURLToPath } from "node:url";
import { pushEventsResponseSchema } from "@purosur/contracts";
import { asc, eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import ts from "typescript";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { registerRouteAccess } from "../access/route-access.js";
import { inbox } from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { TEST_DEVICE_TOKEN_ROTATION_KEY } from "../test-support/device-token-rotation-key.js";
import { TEST_INSTALLATION_KEYS_ENCRYPTION_KEY } from "../test-support/installation-keys-encryption-key.js";
import { registerEventsRoute } from "./events-route.js";
import { type RecordedPush, recordedPushes } from "./test-support/recorded-pushes.js";
import { eventVersionsBuiltBy } from "./test-support/register-event-versions.js";

const NOW = new Date("2026-10-06T15:00:00.000Z");
const REPO_DIR = fileURLToPath(new URL("../../../../", import.meta.url));
const REGISTER_DIR = fileURLToPath(new URL("../../../pos/", import.meta.url));

const RECORDED_PUSHES = recordedPushes();

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let app: FastifyInstance;

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
  app = Fastify();
  registerRouteAccess(app);
  registerEventsRoute(app, {
    db,
    rotationKey: TEST_DEVICE_TOKEN_ROTATION_KEY,
    keysEncryptionKey: TEST_INSTALLATION_KEYS_ENCRYPTION_KEY,
    now: () => NOW,
  });
});

afterEach(async () => {
  await app.close();
});

function registerCoreProgram(): ts.Program {
  const config = ts.getParsedCommandLineOfConfigFile(`${REGISTER_DIR}tsconfig.json`, undefined, {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
      throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
    },
  });
  if (!config) {
    throw new Error("apps/pos/tsconfig.json could not be read");
  }
  return ts.createProgram([`${REGISTER_DIR}src/core/index.ts`], config.options);
}

function storedAsSent(row: typeof inbox.$inferSelect) {
  return {
    event_id: row.eventId,
    device_seq: row.deviceSeq,
    aggregate_type: row.aggregateType,
    aggregate_id: row.aggregateId,
    event_type: row.eventType,
    schema_version: row.schemaVersion,
    payload: row.payload,
    occurred_at: row.occurredAt.toISOString(),
    actor_id: row.actorId,
    chain_hmac: row.chainHmac,
  };
}

describe("the recorded pushes", () => {
  let builtByTheRegister: ReturnType<typeof eventVersionsBuiltBy>;

  beforeAll(() => {
    builtByTheRegister = eventVersionsBuiltBy(registerCoreProgram(), REPO_DIR);
  });

  it("can tell the version of every event the register's core builds", () => {
    expect(builtByTheRegister.unreadable).toEqual([]);
    expect(builtByTheRegister.versions).not.toEqual([]);
  });

  it("hold an event of every version the register's core builds", () => {
    const recorded = new Set(
      RECORDED_PUSHES.flatMap(({ push }) =>
        push.events.map((event) => `${event.event_type} v${event.schema_version}`),
      ),
    );

    expect(builtByTheRegister.versions.filter((version) => !recorded.has(version))).toEqual([]);
  });
});

describe("POST /events with a push a register in the field sent", () => {
  it.each(RECORDED_PUSHES.map((recorded): [string, RecordedPush] => [recorded.name, recorded]))(
    "accepts and stores every event of %s",
    async (_name, { outboxChainKey, sentBody, push }) => {
      const { deviceId, deviceToken } = await insertEnrolledInstallation(db, {
        now: NOW,
        outboxChainKey,
      });

      const response = await app.inject({
        method: "POST",
        url: "/events",
        headers: { authorization: `Bearer ${deviceToken}` },
        payload: sentBody,
      });

      expect(response.statusCode).toBe(200);
      expect(pushEventsResponseSchema.parse(response.json())).toEqual({
        status: "ok",
        ack_seq: push.events.at(-1)?.device_seq,
      });
      const stored = await db
        .select()
        .from(inbox)
        .where(eq(inbox.deviceId, deviceId))
        .orderBy(asc(inbox.deviceSeq));
      expect(stored.map(storedAsSent)).toEqual(push.events);
    },
  );
});
