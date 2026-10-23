import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach } from "vitest";
import { insertEnrolledInstallation } from "../../register/test-support/enrolled-installation.js";
import { keyStore } from "../../register/test-support/key-store.js";
import { registerRouteAccess } from "../../sessions/route-access.js";
import {
  BACKOFFICE_ORIGIN,
  type BackofficeSession,
  openBackofficeSession,
  SESSION_NOON,
} from "../../test-support/backoffice-session.js";
import { buildTestDatabase, type TestDatabase } from "../../test-support/build-test-database.js";
import { TEST_INSTALLATION_KEYS_ENCRYPTION_KEY } from "../../test-support/installation-keys-encryption-key.js";
import { seededLocationId } from "../../test-support/seeded-location.js";
import { registerContingencyBackupTicketRescueRoute } from "../contingency-backup-ticket-rescue-route.js";
import {
  generatedKey,
  sealedTicketQrCodes,
  type TicketEvent,
  ticketContent,
} from "./sealed-contingency-backup-ticket.js";

export const RESCUE_URL = "/contingency-backup-tickets/rescue";
const RESCUE_PERMISSION = "recover_contingency_receipts";
export const TICKET_KEY_VERSION = 1;

export interface RescueRouteUnderTest {
  readonly db: TestDatabase["db"];
  readonly app: FastifyInstance;
}

export function rescueRouteUnderTest(): RescueRouteUnderTest {
  let testDatabase: TestDatabase;
  let app: FastifyInstance;

  beforeAll(async () => {
    testDatabase = await buildTestDatabase();
  });

  afterAll(async () => {
    await testDatabase.close();
  });

  beforeEach(async () => {
    await testDatabase.clear();
    app = Fastify();
    registerRouteAccess(app);
    registerContingencyBackupTicketRescueRoute(app, {
      db: testDatabase.db,
      backofficeOrigin: BACKOFFICE_ORIGIN,
      keysEncryptionKey: TEST_INSTALLATION_KEYS_ENCRYPTION_KEY,
      now: () => SESSION_NOON,
      enqueueEventApplication: async () => {},
    });
  });

  afterEach(async () => {
    await app.close();
  });

  return {
    get db() {
      return testDatabase.db;
    },
    get app() {
      return app;
    },
  };
}

export async function rescueSession(
  db: TestDatabase["db"],
  permissionKeys: string[] = [RESCUE_PERMISSION],
): Promise<BackofficeSession> {
  return openBackofficeSession(db, {
    now: SESSION_NOON,
    locationId: await seededLocationId(db),
    permissionKeys,
  });
}

export interface RegisterWithTicketKey {
  registerId: string;
  deviceId: string;
  locationId: string;
  seal: (events: TicketEvent[], overrides?: { deviceId?: string; keyVersion?: number }) => string[];
}

export async function registerWithTicketKey(
  db: TestDatabase["db"],
  options: { registerName?: string; revokedAt?: Date; existingRegisterId?: string } = {},
): Promise<RegisterWithTicketKey> {
  const installation = await insertEnrolledInstallation(db, {
    now: SESSION_NOON,
    registerName: options.registerName ?? "Caja 1",
    ...(options.revokedAt === undefined ? {} : { revokedAt: options.revokedAt }),
    ...(options.existingRegisterId === undefined
      ? {}
      : { existingRegisterId: options.existingRegisterId }),
  });
  const key = generatedKey();
  await keyStore(db).transaction((tx) =>
    tx.recordContingencyTicketKey(installation.registerId, { version: TICKET_KEY_VERSION, key }),
  );
  return {
    registerId: installation.registerId,
    deviceId: installation.deviceId,
    locationId: installation.locationId,
    seal: (events, overrides = {}) =>
      sealedTicketQrCodes({
        frameRegisterId: installation.registerId,
        keyVersion: overrides.keyVersion ?? TICKET_KEY_VERSION,
        key,
        content: ticketContent(
          installation.registerId,
          overrides.deviceId ?? installation.deviceId,
          events,
        ),
      }),
  };
}

export function rescuing(
  route: RescueRouteUnderTest,
  session: BackofficeSession,
  qrCodes: string[],
) {
  return route.app.inject({
    method: "POST",
    url: RESCUE_URL,
    headers: session.headers,
    payload: { qr_codes: qrCodes },
  });
}
