import type {
  FiscalDocumentSolicitation,
  SolicitationAnswer,
  TaxAuthorityInvoicing,
} from "@purosur/domain/fiscal/use-cases";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach } from "vitest";
import { registerRouteAccess } from "../../access/route-access.js";
import { arcaWsaaTokens } from "../../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../../test-support/build-test-database.js";
import { TEST_DEVICE_TOKEN_ROTATION_KEY } from "../../test-support/device-token-rotation-key.js";
import { TEST_INSTALLATION_KEYS_ENCRYPTION_KEY } from "../../test-support/installation-keys-encryption-key.js";
import { registerFiscalAuthorizationRoute } from "../fiscal-authorization-route.js";

export const NOW = new Date("2026-10-06T15:00:00.000Z");
export const CERTIFICATE_FINGERPRINT = "AB:CD:EF";

export class FakeTaxAuthority implements TaxAuthorityInvoicing {
  readonly solicitations: FiscalDocumentSolicitation[] = [];
  answer: SolicitationAnswer = { kind: "no_answer" };

  async solicit(solicitation: FiscalDocumentSolicitation): Promise<SolicitationAnswer> {
    this.solicitations.push(solicitation);
    return this.answer;
  }
}

export interface FiscalAuthorizationRouteUnderTest {
  readonly db: TestDatabase["db"];
  readonly app: FastifyInstance;
  readonly taxAuthority: FakeTaxAuthority;
  issueWsaaToken(): Promise<void>;
  readClockWith(now: () => Date): void;
}

export function fiscalAuthorizationRouteUnderTest(): FiscalAuthorizationRouteUnderTest {
  let testDatabase: TestDatabase;
  let app: FastifyInstance;
  let taxAuthority: FakeTaxAuthority;
  let now: () => Date;

  beforeAll(async () => {
    testDatabase = await buildTestDatabase();
  });

  afterAll(async () => {
    await testDatabase.close();
  });

  beforeEach(async () => {
    await testDatabase.clear();
    taxAuthority = new FakeTaxAuthority();
    now = () => NOW;
    app = Fastify();
    registerRouteAccess(app);
    registerFiscalAuthorizationRoute(app, {
      db: testDatabase.db,
      rotationKey: TEST_DEVICE_TOKEN_ROTATION_KEY,
      keysEncryptionKey: TEST_INSTALLATION_KEYS_ENCRYPTION_KEY,
      now: () => now(),
      connections: { withConnection: (work) => work(testDatabase.db) },
      taxAuthority,
      certificateFingerprint: CERTIFICATE_FINGERPRINT,
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
    get taxAuthority() {
      return taxAuthority;
    },
    readClockWith(clock) {
      now = clock;
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
