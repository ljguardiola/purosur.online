import { FICTIONAL_CERTIFICATE_CUIT } from "@purosur/domain/fiscal/test-support";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, type Mock, vi } from "vitest";
import { arcaWsaaTokens } from "../../platform/db/schema.js";
import type { reportError } from "../../platform/error-reporting.js";
import { registerRouteAccess } from "../../sessions/route-access.js";
import { registerEventsRoute } from "../../sync/events-route.js";
import { buildTestDatabase, type TestDatabase } from "../../test-support/build-test-database.js";
import { TEST_DEVICE_TOKEN_ROTATION_KEY } from "../../test-support/device-token-rotation-key.js";
import { TEST_INSTALLATION_KEYS_ENCRYPTION_KEY } from "../../test-support/installation-keys-encryption-key.js";
import { registerCreditNoteRoute } from "../credit-note-route.js";
import { WsfeTaxAuthorityCreditNotes } from "../wsfe-tax-authority-credit-notes.js";
import { WsfeTaxAuthorityLastAuthorized } from "../wsfe-tax-authority-last-authorized.js";
import { WsfeTaxAuthorityVouchers } from "../wsfe-tax-authority-vouchers.js";
import { type FakeWsfeServer, startFakeWsfeServer } from "./fake-wsfe-server.js";

export const NOW = new Date("2026-10-08T01:30:00.000Z");
export const CERTIFICATE_FINGERPRINT = "AB:CD:EF";

export interface CreditNoteRouteUnderTest {
  readonly db: TestDatabase["db"];
  readonly app: FastifyInstance;
  readonly wsfe: FakeWsfeServer;
  readonly creditNotes: WsfeTaxAuthorityCreditNotes;
  readonly report: Mock<typeof reportError>;
  readonly enqueuedCreditNotes: readonly string[];
  issueWsaaToken(): Promise<void>;
}

export function creditNoteRouteUnderTest(): CreditNoteRouteUnderTest {
  let testDatabase: TestDatabase;
  let wsfe: FakeWsfeServer;
  let app: FastifyInstance;
  let enqueued: string[];
  let creditNotes: WsfeTaxAuthorityCreditNotes;
  let report: Mock<typeof reportError>;

  beforeAll(async () => {
    testDatabase = await buildTestDatabase();
    wsfe = await startFakeWsfeServer();
  });

  afterAll(async () => {
    await wsfe.close();
    await testDatabase.close();
  });

  beforeEach(async () => {
    await testDatabase.clear();
    wsfe.requests.length = 0;
    enqueued = [];
    const connection = {
      endpoint: wsfe.endpoint,
      cuit: FICTIONAL_CERTIFICATE_CUIT,
      timeoutMs: 2_000,
    };
    creditNotes = new WsfeTaxAuthorityCreditNotes(connection);
    report = vi.fn();
    app = Fastify();
    registerRouteAccess(app);
    registerCreditNoteRoute(app, {
      db: testDatabase.db,
      rotationKey: TEST_DEVICE_TOKEN_ROTATION_KEY,
      keysEncryptionKey: TEST_INSTALLATION_KEYS_ENCRYPTION_KEY,
      now: () => NOW,
      connections: { withConnection: (work) => work(testDatabase.db) },
      vouchers: new WsfeTaxAuthorityVouchers(connection),
      taxAuthority: new WsfeTaxAuthorityLastAuthorized(connection),
      creditNotes,
      certificateFingerprint: CERTIFICATE_FINGERPRINT,
      enqueueCreditNote: async (_, creditNoteId) => {
        enqueued.push(creditNoteId);
      },
      enqueueEventApplication: async () => {},
      report,
    });
    registerEventsRoute(app, {
      db: testDatabase.db,
      rotationKey: TEST_DEVICE_TOKEN_ROTATION_KEY,
      keysEncryptionKey: TEST_INSTALLATION_KEYS_ENCRYPTION_KEY,
      now: () => NOW,
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
    get wsfe() {
      return wsfe;
    },
    get creditNotes() {
      return creditNotes;
    },
    get report() {
      return report;
    },
    get enqueuedCreditNotes() {
      return [...enqueued];
    },
    async issueWsaaToken() {
      await testDatabase.db.insert(arcaWsaaTokens).values({
        service: "wsfe",
        certificateFingerprint: CERTIFICATE_FINGERPRINT,
        token: "FICTIONAL-TOKEN",
        sign: "FICTIONAL-SIGN",
        issuedAt: new Date(NOW.getTime() - 60_000),
        expiresAt: new Date(NOW.getTime() + 60 * 60_000),
      });
    },
  };
}
