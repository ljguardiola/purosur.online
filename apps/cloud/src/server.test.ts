import { generateKeyPairSync, X509Certificate } from "node:crypto";
import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FICTIONAL_CERTIFICATE_CUIT } from "@purosur/domain/fiscal/test-support";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { type BuildAppOptions, buildApp as buildRealApp } from "./app.js";
import { enqueueCreditNoteJob } from "./fiscal/graphile-credit-note-queue.js";
import {
  enqueueNumberingDiagnosisJob,
  enqueueNumberingReconciliationJob,
} from "./fiscal/graphile-numbering-conflict-queue.js";
import { enqueueOfflineAuthorizationCodeRequest } from "./fiscal/graphile-offline-authorization-code-queue.js";
import { enqueueTaxAuthorityCountJob } from "./fiscal/graphile-tax-authority-count-queue.js";
import {
  enqueueUnclearOutcomeJob,
  withdrawUnclearOutcomeJob,
} from "./fiscal/graphile-unclear-outcome-queue.js";
import { generateArcaTestCredentials } from "./fiscal/test-support/arca-test-credentials.js";
import { unreachableArcaEndpoints } from "./fiscal/test-support/unreachable-arca-endpoints.js";
import { WsfeTaxAuthorityInvoicing } from "./fiscal/wsfe-tax-authority-invoicing.js";
import {
  arcaEndpointsOf,
  closeBackgroundJobResources,
  createBackgroundJobQueuePool,
  registerShutdownHandlers,
  reportStartupFailure,
  requireArcaEnvironment,
  requireAuthorizedCuit,
  requireCertificateNotAfter,
  requireDeviceTokenRotationKey,
  requireInstallationKeysEncryptionKey,
  resolvePort,
  resolveRecoveryEnv,
  resolveStaticDir,
  resolveVersion,
  type SetUpBackgroundJobsEnv,
  type StartServerDeps,
  shutdownServer,
  startServer,
} from "./server.js";
import {
  ARCA_CERTIFICATE_WITH_MALFORMED_SERIAL_NUMBER,
  ARCA_CERTIFICATE_WITH_MULTI_VALUED_SUBJECT,
  ARCA_CERTIFICATE_WITH_PLUS_INSIDE_A_VALUE,
  ARCA_CERTIFICATE_WITH_WRONG_CHECK_DIGIT,
  ARCA_CERTIFICATE_WITHOUT_SERIAL_NUMBER,
  VALID_ARCA_CERTIFICATE,
  VALID_ARCA_CERTIFICATE_SINGLE_LINE,
} from "./test-support/arca-certificate-fixtures.js";
import {
  FICTIONAL_RECOVERY_REPLY_TO,
  FICTIONAL_RECOVERY_SENDER,
} from "./test-support/recovery-email.js";

describe("resolveVersion", () => {
  it("returns APP_VERSION when set", () => {
    expect(resolveVersion({ APP_VERSION: "abc1234" })).toBe("abc1234");
  });

  it("falls back to unknown when APP_VERSION is missing or empty", () => {
    expect(resolveVersion({})).toBe("unknown");
    expect(resolveVersion({ APP_VERSION: "" })).toBe("unknown");
  });
});

describe("resolvePort", () => {
  it("returns the parsed PORT", () => {
    expect(resolvePort({ PORT: "8080" })).toBe(8080);
  });

  it("falls back to 3000 when PORT is missing or not a positive integer", () => {
    expect(resolvePort({})).toBe(3000);
    expect(resolvePort({ PORT: "not-a-number" })).toBe(3000);
    expect(resolvePort({ PORT: "-1" })).toBe(3000);
  });
});

const ROTATION_KEY_BYTES = Buffer.alloc(32, 5);
const ROTATION_KEY = ROTATION_KEY_BYTES.toString("base64");

describe("requireDeviceTokenRotationKey", () => {
  it("returns the key decoded from base64", () => {
    expect(requireDeviceTokenRotationKey({ DEVICE_TOKEN_ROTATION_KEY: ROTATION_KEY })).toEqual(
      ROTATION_KEY_BYTES,
    );
  });

  it("throws when DEVICE_TOKEN_ROTATION_KEY is not set", () => {
    expect(() => requireDeviceTokenRotationKey({})).toThrow(
      "DEVICE_TOKEN_ROTATION_KEY must be set once DATABASE_URL is configured",
    );
  });

  it("throws when the key holds fewer than 32 bytes", () => {
    const shortKey = Buffer.alloc(31, 5).toString("base64");

    expect(() => requireDeviceTokenRotationKey({ DEVICE_TOKEN_ROTATION_KEY: shortKey })).toThrow(
      "DEVICE_TOKEN_ROTATION_KEY must hold at least 32 bytes",
    );
  });
});

const KEYS_ENCRYPTION_KEY_BYTES = Buffer.alloc(32, 6);
const KEYS_ENCRYPTION_KEY = KEYS_ENCRYPTION_KEY_BYTES.toString("base64");

describe("requireInstallationKeysEncryptionKey", () => {
  it("returns the key decoded from base64", () => {
    expect(
      requireInstallationKeysEncryptionKey({
        INSTALLATION_KEYS_ENCRYPTION_KEY: KEYS_ENCRYPTION_KEY,
      }),
    ).toEqual(KEYS_ENCRYPTION_KEY_BYTES);
  });

  it("throws when INSTALLATION_KEYS_ENCRYPTION_KEY is not set", () => {
    expect(() => requireInstallationKeysEncryptionKey({})).toThrow(
      "INSTALLATION_KEYS_ENCRYPTION_KEY must be set once DATABASE_URL is configured",
    );
  });

  it.each([31, 33, 64])("throws when the key holds %i bytes instead of 32", (length) => {
    const wrongSize = Buffer.alloc(length, 6).toString("base64");

    expect(() =>
      requireInstallationKeysEncryptionKey({ INSTALLATION_KEYS_ENCRYPTION_KEY: wrongSize }),
    ).toThrow("INSTALLATION_KEYS_ENCRYPTION_KEY must hold exactly 32 bytes");
  });
});

const VALID_ARCA_CERTIFICATE_NOT_AFTER = new Date("2126-09-01T19:42:17.000Z");

describe("requireCertificateNotAfter", () => {
  it("returns the instant the certificate stops being valid", () => {
    expect(requireCertificateNotAfter({ ARCA_CERTIFICATE: VALID_ARCA_CERTIFICATE })).toEqual(
      VALID_ARCA_CERTIFICATE_NOT_AFTER,
    );
  });

  it("reads it from the same certificate delivered as a single line with literal \\n sequences", () => {
    expect(
      requireCertificateNotAfter({ ARCA_CERTIFICATE: VALID_ARCA_CERTIFICATE_SINGLE_LINE }),
    ).toEqual(VALID_ARCA_CERTIFICATE_NOT_AFTER);
  });

  it("throws when ARCA_CERTIFICATE is not set", () => {
    expect(() => requireCertificateNotAfter({})).toThrow(
      "ARCA_CERTIFICATE must be set once DATABASE_URL is configured",
    );
  });

  it("throws when ARCA_CERTIFICATE is not a parseable certificate", () => {
    expect(() => requireCertificateNotAfter({ ARCA_CERTIFICATE: "not a certificate" })).toThrow(
      "ARCA_CERTIFICATE must be a valid X.509 certificate",
    );
  });
});

describe("requireArcaEnvironment", () => {
  it.each(["homologation", "production"])("accepts %s", (environment) => {
    expect(requireArcaEnvironment({ ARCA_ENVIRONMENT: environment })).toBe(environment);
  });

  it.each([undefined, ""])("throws when ARCA_ENVIRONMENT is %j", (value) => {
    expect(() => requireArcaEnvironment({ ARCA_ENVIRONMENT: value })).toThrow(
      "ARCA_ENVIRONMENT must be set once DATABASE_URL is configured",
    );
  });

  it.each(["staging", "Production"])("throws on %j, naming the accepted values", (value) => {
    expect(() => requireArcaEnvironment({ ARCA_ENVIRONMENT: value })).toThrow(
      'ARCA_ENVIRONMENT must be "homologation" or "production"',
    );
  });
});

describe("requireAuthorizedCuit", () => {
  it("returns the CUIT carried in the certificate's serialNumber, normalized to NN-NNNNNNNN-N", () => {
    expect(requireAuthorizedCuit({ ARCA_CERTIFICATE: VALID_ARCA_CERTIFICATE })).toBe(
      FICTIONAL_CERTIFICATE_CUIT,
    );
  });

  it("accepts the same certificate delivered as a single line with literal \\n sequences", () => {
    expect(requireAuthorizedCuit({ ARCA_CERTIFICATE: VALID_ARCA_CERTIFICATE_SINGLE_LINE })).toBe(
      FICTIONAL_CERTIFICATE_CUIT,
    );
  });

  it("finds the serialNumber inside a multi-valued subject RDN", () => {
    expect(
      requireAuthorizedCuit({ ARCA_CERTIFICATE: ARCA_CERTIFICATE_WITH_MULTI_VALUED_SUBJECT }),
    ).toBe(FICTIONAL_CERTIFICATE_CUIT);
  });

  it("throws when ARCA_CERTIFICATE is not set", () => {
    expect(() => requireAuthorizedCuit({})).toThrow(
      "ARCA_CERTIFICATE must be set once DATABASE_URL is configured",
    );
  });

  it("throws when ARCA_CERTIFICATE is not a parseable certificate", () => {
    expect(() => requireAuthorizedCuit({ ARCA_CERTIFICATE: "not a certificate" })).toThrow(
      "ARCA_CERTIFICATE must be a valid X.509 certificate",
    );
  });

  it("keeps the parser's reason as the cause of an unparseable certificate's error", () => {
    expect(() => requireAuthorizedCuit({ ARCA_CERTIFICATE: "not a certificate" })).toThrow(
      expect.objectContaining({ cause: expect.any(Error) }),
    );
  });

  it("throws when the certificate's subject has no serialNumber", () => {
    expect(() =>
      requireAuthorizedCuit({ ARCA_CERTIFICATE: ARCA_CERTIFICATE_WITHOUT_SERIAL_NUMBER }),
    ).toThrow("ARCA_CERTIFICATE's subject has no serialNumber");
  });

  it("never reads a serialNumber out of a value that merely contains an escaped +", () => {
    expect(() =>
      requireAuthorizedCuit({ ARCA_CERTIFICATE: ARCA_CERTIFICATE_WITH_PLUS_INSIDE_A_VALUE }),
    ).toThrow("ARCA_CERTIFICATE's subject has no serialNumber");
  });

  it('throws when the serialNumber is not in the exact "CUIT <11 digits>" form', () => {
    expect(() =>
      requireAuthorizedCuit({ ARCA_CERTIFICATE: ARCA_CERTIFICATE_WITH_MALFORMED_SERIAL_NUMBER }),
    ).toThrow('ARCA_CERTIFICATE\'s serialNumber must be in the form "CUIT <11 digits>"');
  });

  it("throws when the CUIT's check digit is wrong", () => {
    expect(() =>
      requireAuthorizedCuit({ ARCA_CERTIFICATE: ARCA_CERTIFICATE_WITH_WRONG_CHECK_DIGIT }),
    ).toThrow("ARCA_CERTIFICATE's CUIT must have a correct check digit");
  });
});

describe("resolveStaticDir", () => {
  const dirs: string[] = [];

  function tempDir(withIndexHtml: boolean): string {
    const dir = mkdtempSync(join(tmpdir(), "cloud-static-default-"));
    dirs.push(dir);
    if (withIndexHtml) {
      writeFileSync(join(dir, "index.html"), "<!doctype html>");
    }
    return dir;
  }

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns BACKOFFICE_STATIC_DIR when it holds a build", () => {
    const dir = tempDir(true);
    expect(resolveStaticDir({ BACKOFFICE_STATIC_DIR: dir }, "/default")).toBe(dir);
  });

  it("refuses to start when BACKOFFICE_STATIC_DIR does not exist", () => {
    expect(() =>
      resolveStaticDir({ BACKOFFICE_STATIC_DIR: "/does/not/exist" }, "/default"),
    ).toThrow("/does/not/exist");
  });

  it("refuses to start when BACKOFFICE_STATIC_DIR has no index.html", () => {
    const dir = tempDir(false);
    expect(() => resolveStaticDir({ BACKOFFICE_STATIC_DIR: dir }, "/default")).toThrow(dir);
  });

  it("returns the default directory when it holds a build", () => {
    const dir = tempDir(true);
    expect(resolveStaticDir({}, dir)).toBe(dir);
  });

  it("returns undefined when the default directory holds no build", () => {
    expect(resolveStaticDir({}, tempDir(false))).toBeUndefined();
    expect(resolveStaticDir({}, "/definitely/does/not/exist/purosur-backoffice")).toBeUndefined();
  });
});

describe("resolveRecoveryEnv", () => {
  it("returns undefined when DATABASE_URL is not set, same as a dev environment with no database", () => {
    expect(resolveRecoveryEnv({})).toBeUndefined();
  });

  const FULL_RECOVERY_ENV = {
    DATABASE_URL: "postgres://user:pass@db/purosur",
    RESEND_API_KEY: "re_test_key",
    RECOVERY_EMAIL_FROM: FICTIONAL_RECOVERY_SENDER,
    RECOVERY_EMAIL_REPLY_TO: FICTIONAL_RECOVERY_REPLY_TO,
    BACKOFFICE_ORIGIN: "https://staging.purosur.online",
  };

  it("resolves every field once DATABASE_URL and the rest are all set, defaulting to the Resend transport", () => {
    expect(resolveRecoveryEnv(FULL_RECOVERY_ENV)).toEqual({
      databaseUrl: "postgres://user:pass@db/purosur",
      emailSender: { transport: "resend", resendApiKey: "re_test_key" },
      emailFrom: FICTIONAL_RECOVERY_SENDER,
      emailReplyTo: FICTIONAL_RECOVERY_REPLY_TO,
      backofficeOrigin: "https://staging.purosur.online",
    });
  });

  it.each([
    "RESEND_API_KEY",
    "RECOVERY_EMAIL_FROM",
    "RECOVERY_EMAIL_REPLY_TO",
    "BACKOFFICE_ORIGIN",
  ] as const)("throws when DATABASE_URL is set but %s is missing", (missing) => {
    const env = { ...FULL_RECOVERY_ENV, [missing]: undefined };

    expect(() => resolveRecoveryEnv(env)).toThrow(missing);
  });

  describe("RECOVERY_EMAIL_TRANSPORT", () => {
    const { RESEND_API_KEY: _unused, ...ENV_WITHOUT_RESEND_API_KEY } = FULL_RECOVERY_ENV;

    it("selects the log transport, without requiring RESEND_API_KEY, when set to exactly log with a localhost BACKOFFICE_ORIGIN", () => {
      const env = {
        ...ENV_WITHOUT_RESEND_API_KEY,
        RECOVERY_EMAIL_TRANSPORT: "log",
        BACKOFFICE_ORIGIN: "http://localhost:5173",
      };

      expect(resolveRecoveryEnv(env)).toEqual({
        databaseUrl: "postgres://user:pass@db/purosur",
        emailSender: { transport: "log" },
        emailFrom: FICTIONAL_RECOVERY_SENDER,
        emailReplyTo: FICTIONAL_RECOVERY_REPLY_TO,
        backofficeOrigin: "http://localhost:5173",
      });
    });

    it("selects the log transport with a 127.0.0.1 BACKOFFICE_ORIGIN too", () => {
      const env = {
        ...ENV_WITHOUT_RESEND_API_KEY,
        RECOVERY_EMAIL_TRANSPORT: "log",
        BACKOFFICE_ORIGIN: "http://127.0.0.1:5173",
      };

      expect(resolveRecoveryEnv(env)).toEqual({
        databaseUrl: "postgres://user:pass@db/purosur",
        emailSender: { transport: "log" },
        emailFrom: FICTIONAL_RECOVERY_SENDER,
        emailReplyTo: FICTIONAL_RECOVERY_REPLY_TO,
        backofficeOrigin: "http://127.0.0.1:5173",
      });
    });

    it("refuses to start, naming RECOVERY_EMAIL_TRANSPORT and BACKOFFICE_ORIGIN, when log is selected with a deployed BACKOFFICE_ORIGIN", () => {
      const env = {
        ...ENV_WITHOUT_RESEND_API_KEY,
        RECOVERY_EMAIL_TRANSPORT: "log",
        BACKOFFICE_ORIGIN: "https://staging.purosur.online",
      };

      expect(() => resolveRecoveryEnv(env)).toThrow(/RECOVERY_EMAIL_TRANSPORT/);
      expect(() => resolveRecoveryEnv(env)).toThrow(/BACKOFFICE_ORIGIN/);
      expect(() => resolveRecoveryEnv(env)).toThrow(/local development only/);
    });

    it("falls back to the Resend transport, still requiring RESEND_API_KEY, when unset", () => {
      const env = { ...ENV_WITHOUT_RESEND_API_KEY };

      expect(() => resolveRecoveryEnv(env)).toThrow("RESEND_API_KEY");
    });

    it.each(["Log", "LOG", "true", "1", "resend-and-log"])(
      "falls back to the Resend transport, still requiring RESEND_API_KEY, rather than logging on an unknown value %s",
      (value) => {
        const env = { ...ENV_WITHOUT_RESEND_API_KEY, RECOVERY_EMAIL_TRANSPORT: value };

        expect(() => resolveRecoveryEnv(env)).toThrow("RESEND_API_KEY");
      },
    );
  });
});

const now = () => new Date("2026-01-05T12:00:00.000Z");

function appListeningBy(listen: (...args: unknown[]) => Promise<unknown>): FastifyInstance {
  const app = Fastify();
  app.listen = async (...args: unknown[]) => {
    await listen(...args);
    return "";
  };
  return app;
}

describe("startServer", () => {
  it("initializes Sentry, builds the app with the resolved version and static dir, and listens on PORT/0.0.0.0", async () => {
    const listen = vi.fn().mockResolvedValue(undefined);
    const fakeApp = appListeningBy(listen);
    const initSentry = vi.fn();
    const buildApp = vi.fn().mockReturnValue(fakeApp);

    const staticDir = mkdtempSync(join(tmpdir(), "cloud-static-start-"));
    writeFileSync(join(staticDir, "index.html"), "<!doctype html>");
    const env = {
      PORT: "4000",
      APP_VERSION: "sha123",
      SENTRY_DSN: "https://public@sentry.example/1",
      SENTRY_ENVIRONMENT: "staging",
      BACKOFFICE_STATIC_DIR: staticDir,
      EDGE_ORIGIN_SECRET: "edge-secret",
    };

    const app = await startServer(env, {
      arcaEndpoints: unreachableArcaEndpoints,
      initSentry,
      buildApp,
      now,
    }).finally(() => rmSync(staticDir, { recursive: true, force: true }));

    expect(initSentry).toHaveBeenCalledWith({
      dsn: "https://public@sentry.example/1",
      environment: "staging",
      release: "sha123",
    });
    expect(buildApp).toHaveBeenCalledWith({
      version: "sha123",
      now,
      edgeOriginSecret: "edge-secret",
      staticDir,
    });
    expect(listen).toHaveBeenCalledWith({ port: 4000, host: "0.0.0.0" });
    expect(app).toBe(fakeApp);
  });

  it("tags the cloud's error reports with the same version the app serves when APP_VERSION is empty", async () => {
    const listen = vi.fn().mockResolvedValue(undefined);
    const fakeApp = appListeningBy(listen);
    const initSentry = vi.fn();
    const buildApp = vi.fn().mockReturnValue(fakeApp);

    await startServer(
      {
        APP_VERSION: "",
        SENTRY_DSN: "https://public@sentry.example/1",
        SENTRY_ENVIRONMENT: "staging",
        EDGE_ORIGIN_SECRET: "edge-secret",
      },
      { arcaEndpoints: unreachableArcaEndpoints, initSentry, buildApp },
    );

    expect(buildApp).toHaveBeenCalledWith(expect.objectContaining({ version: "unknown" }));
    expect(initSentry).toHaveBeenCalledWith(expect.objectContaining({ release: "unknown" }));
  });

  it("gives the app the backoffice's error reporting when its DSN is configured", async () => {
    const listen = vi.fn().mockResolvedValue(undefined);
    const fakeApp = appListeningBy(listen);
    const buildApp = vi.fn().mockReturnValue(fakeApp);

    await startServer(
      {
        EDGE_ORIGIN_SECRET: "edge-secret",
        BACKOFFICE_SENTRY_DSN: "https://key@errors.example.test/1",
        SENTRY_ENVIRONMENT: "staging",
      },
      { arcaEndpoints: unreachableArcaEndpoints, initSentry: vi.fn(), buildApp },
    );

    expect(buildApp).toHaveBeenCalledWith(
      expect.objectContaining({
        errorReporting: { dsn: "https://key@errors.example.test/1", environment: "staging" },
      }),
    );
  });

  it("gives the app the register update feed read from the configured updates bucket", async () => {
    const buildApp = vi.fn().mockReturnValue(appListeningBy(vi.fn().mockResolvedValue(undefined)));

    await startServer(
      {
        EDGE_ORIGIN_SECRET: "edge-secret",
        REGISTER_UPDATES_BUCKET_ENDPOINT: "https://storage.example.com",
        REGISTER_UPDATES_BUCKET_NAME: "register-builds",
        REGISTER_UPDATES_BUCKET_REGION: "auto",
        REGISTER_UPDATES_BUCKET_ACCESS_KEY_ID: "fictional-key-id",
        REGISTER_UPDATES_BUCKET_SECRET_ACCESS_KEY: "fictional-secret",
      },
      { arcaEndpoints: unreachableArcaEndpoints, initSentry: vi.fn(), buildApp, now },
    );

    const [options] = buildApp.mock.calls[0] ?? [];
    const downloadUrl = new URL(
      await options.registerUpdateFeed.downloadUrl({
        version: { major: 1, minor: 4, patch: 2 },
        file: "Setup.exe",
        size: 1,
        sha512: "",
      }),
    );
    expect(`${downloadUrl.origin}${downloadUrl.pathname}`).toBe(
      "https://register-builds.storage.example.com/register-updates/1.4.2/Setup.exe",
    );
    expect(downloadUrl.searchParams.get("X-Amz-Credential")).toMatch(/^fictional-key-id\//);
  });

  it("gives the app the register snapshot URLs presigned for the configured snapshots bucket", async () => {
    const buildApp = vi.fn().mockReturnValue(appListeningBy(vi.fn().mockResolvedValue(undefined)));

    await startServer(
      {
        EDGE_ORIGIN_SECRET: "edge-secret",
        REGISTER_SNAPSHOTS_BUCKET_ENDPOINT: "https://storage.example.com",
        REGISTER_SNAPSHOTS_BUCKET_NAME: "register-backups",
        REGISTER_SNAPSHOTS_BUCKET_REGION: "auto",
        REGISTER_SNAPSHOTS_BUCKET_ACCESS_KEY_ID: "fictional-key-id",
        REGISTER_SNAPSHOTS_BUCKET_SECRET_ACCESS_KEY: "fictional-secret",
      },
      { arcaEndpoints: unreachableArcaEndpoints, initSentry: vi.fn(), buildApp, now },
    );

    const [options] = buildApp.mock.calls[0] ?? [];
    const downloadUrl = new URL(await options.registerSnapshotUrls.downloadUrl("reg-1", "gen-1"));
    expect(`${downloadUrl.origin}${downloadUrl.pathname}`).toBe(
      "https://register-backups.storage.example.com/snapshots/reg-1/gen-1",
    );
    expect(downloadUrl.searchParams.get("X-Amz-Credential")).toMatch(/^fictional-key-id\//);
  });

  it("gives the app no register snapshot URLs when no snapshots bucket is configured", async () => {
    const buildApp = vi.fn().mockReturnValue(appListeningBy(vi.fn().mockResolvedValue(undefined)));

    await startServer(
      { EDGE_ORIGIN_SECRET: "edge-secret" },
      { arcaEndpoints: unreachableArcaEndpoints, initSentry: vi.fn(), buildApp, now },
    );

    const [options] = buildApp.mock.calls[0] ?? [];
    expect(options).not.toHaveProperty("registerSnapshotUrls");
  });

  it("refuses to start with a backoffice DSN and no environment to tell its reports apart by", async () => {
    const buildApp = vi.fn();

    await expect(
      startServer(
        {
          EDGE_ORIGIN_SECRET: "edge-secret",
          BACKOFFICE_SENTRY_DSN: "https://key@errors.example.test/1",
        },
        { arcaEndpoints: unreachableArcaEndpoints, initSentry: vi.fn(), buildApp },
      ),
    ).rejects.toThrow("SENTRY_ENVIRONMENT must be set when BACKOFFICE_SENTRY_DSN is");
    expect(buildApp).not.toHaveBeenCalled();
  });

  it("builds the app with an undefined staticDir when none is configured and the default doesn't exist", async () => {
    const listen = vi.fn().mockResolvedValue(undefined);
    const fakeApp = appListeningBy(listen);
    const buildApp = vi.fn().mockReturnValue(fakeApp);

    await startServer(
      { EDGE_ORIGIN_SECRET: "edge-secret" },
      { arcaEndpoints: unreachableArcaEndpoints, initSentry: vi.fn(), buildApp, now },
    );

    expect(buildApp).toHaveBeenCalledWith({
      version: "unknown",
      now,
      edgeOriginSecret: "edge-secret",
      staticDir: undefined,
    });
  });

  it("builds the app with no recovery option when DATABASE_URL is not set", async () => {
    const listen = vi.fn().mockResolvedValue(undefined);
    const fakeApp = appListeningBy(listen);
    const buildApp = vi.fn().mockReturnValue(fakeApp);
    const setUpBackgroundJobs = vi.fn();

    await startServer(
      { EDGE_ORIGIN_SECRET: "edge-secret" },
      {
        arcaEndpoints: unreachableArcaEndpoints,
        initSentry: vi.fn(),
        buildApp,
        setUpBackgroundJobs,
        now,
      },
    );

    expect(setUpBackgroundJobs).not.toHaveBeenCalled();
    expect(buildApp).toHaveBeenCalledWith({
      version: "unknown",
      now,
      edgeOriginSecret: "edge-secret",
      staticDir: undefined,
    });
  });

  it("refuses to start when EDGE_ORIGIN_SECRET is not set", async () => {
    const buildApp = vi.fn();

    await expect(
      startServer({}, { arcaEndpoints: unreachableArcaEndpoints, initSentry: vi.fn(), buildApp }),
    ).rejects.toThrow("EDGE_ORIGIN_SECRET");
    expect(buildApp).not.toHaveBeenCalled();
  });

  it("refuses to start without EDGE_ORIGIN_SECRET before opening any database or job-queue resource", async () => {
    const buildApp = vi.fn();
    const setUpBackgroundJobs = vi.fn();
    const env = {
      DATABASE_URL: "postgres://user:pass@db/purosur",
      RESEND_API_KEY: "re_test_key",
      RECOVERY_EMAIL_FROM: FICTIONAL_RECOVERY_SENDER,
      RECOVERY_EMAIL_REPLY_TO: FICTIONAL_RECOVERY_REPLY_TO,
      BACKOFFICE_ORIGIN: "https://staging.purosur.online",
    };

    await expect(
      startServer(env, {
        arcaEndpoints: unreachableArcaEndpoints,
        initSentry: vi.fn(),
        buildApp,
        setUpBackgroundJobs,
      }),
    ).rejects.toThrow("EDGE_ORIGIN_SECRET");
    expect(setUpBackgroundJobs).not.toHaveBeenCalled();
    expect(buildApp).not.toHaveBeenCalled();
  });

  it("does not require ARCA_CERTIFICATE when DATABASE_URL is not set", async () => {
    const listen = vi.fn().mockResolvedValue(undefined);
    const fakeApp = appListeningBy(listen);
    const buildApp = vi.fn().mockReturnValue(fakeApp);

    await startServer(
      { EDGE_ORIGIN_SECRET: "edge-secret" },
      { arcaEndpoints: unreachableArcaEndpoints, initSentry: vi.fn(), buildApp },
    );

    expect(buildApp).toHaveBeenCalledWith(
      expect.not.objectContaining({ issuerIdentification: expect.anything() }),
    );
  });

  it("refuses to start when DATABASE_URL is set but ARCA_CERTIFICATE is not, before opening any database or job-queue resource", async () => {
    const buildApp = vi.fn();
    const setUpBackgroundJobs = vi.fn();
    const env = {
      DATABASE_URL: "postgres://user:pass@db/purosur",
      RESEND_API_KEY: "re_test_key",
      RECOVERY_EMAIL_FROM: FICTIONAL_RECOVERY_SENDER,
      RECOVERY_EMAIL_REPLY_TO: FICTIONAL_RECOVERY_REPLY_TO,
      BACKOFFICE_ORIGIN: "https://staging.purosur.online",
      EDGE_ORIGIN_SECRET: "edge-secret",
    };

    await expect(
      startServer(env, {
        arcaEndpoints: unreachableArcaEndpoints,
        initSentry: vi.fn(),
        buildApp,
        setUpBackgroundJobs,
      }),
    ).rejects.toThrow("ARCA_CERTIFICATE must be set once DATABASE_URL is configured");
    expect(setUpBackgroundJobs).not.toHaveBeenCalled();
    expect(buildApp).not.toHaveBeenCalled();
  });

  it("refuses to start when DATABASE_URL is set but DEVICE_TOKEN_ROTATION_KEY is not, before opening any database or job-queue resource", async () => {
    const buildApp = vi.fn();
    const setUpBackgroundJobs = vi.fn();
    const env = {
      DATABASE_URL: "postgres://user:pass@db/purosur",
      RESEND_API_KEY: "re_test_key",
      RECOVERY_EMAIL_FROM: FICTIONAL_RECOVERY_SENDER,
      RECOVERY_EMAIL_REPLY_TO: FICTIONAL_RECOVERY_REPLY_TO,
      BACKOFFICE_ORIGIN: "https://staging.purosur.online",
      EDGE_ORIGIN_SECRET: "edge-secret",
      ARCA_CERTIFICATE: VALID_ARCA_CERTIFICATE,
      ARCA_ENVIRONMENT: "production",
    };

    await expect(
      startServer(env, {
        arcaEndpoints: unreachableArcaEndpoints,
        initSentry: vi.fn(),
        buildApp,
        setUpBackgroundJobs,
      }),
    ).rejects.toThrow("DEVICE_TOKEN_ROTATION_KEY must be set once DATABASE_URL is configured");
    expect(setUpBackgroundJobs).not.toHaveBeenCalled();
    expect(buildApp).not.toHaveBeenCalled();
  });

  it("refuses to start when DATABASE_URL is set but INSTALLATION_KEYS_ENCRYPTION_KEY is not, before opening any database or job-queue resource", async () => {
    const buildApp = vi.fn();
    const setUpBackgroundJobs = vi.fn();
    const env = {
      DATABASE_URL: "postgres://user:pass@db/purosur",
      RESEND_API_KEY: "re_test_key",
      RECOVERY_EMAIL_FROM: FICTIONAL_RECOVERY_SENDER,
      RECOVERY_EMAIL_REPLY_TO: FICTIONAL_RECOVERY_REPLY_TO,
      BACKOFFICE_ORIGIN: "https://staging.purosur.online",
      EDGE_ORIGIN_SECRET: "edge-secret",
      ARCA_CERTIFICATE: VALID_ARCA_CERTIFICATE,
      ARCA_ENVIRONMENT: "production",
      DEVICE_TOKEN_ROTATION_KEY: ROTATION_KEY,
    };

    await expect(
      startServer(env, {
        arcaEndpoints: unreachableArcaEndpoints,
        initSentry: vi.fn(),
        buildApp,
        setUpBackgroundJobs,
      }),
    ).rejects.toThrow(
      "INSTALLATION_KEYS_ENCRYPTION_KEY must be set once DATABASE_URL is configured",
    );
    expect(setUpBackgroundJobs).not.toHaveBeenCalled();
    expect(buildApp).not.toHaveBeenCalled();
  });

  it("refuses to start when ARCA_CERTIFICATE's CUIT is not valid", async () => {
    const buildApp = vi.fn();
    const setUpBackgroundJobs = vi.fn();
    const env = {
      DATABASE_URL: "postgres://user:pass@db/purosur",
      RESEND_API_KEY: "re_test_key",
      RECOVERY_EMAIL_FROM: FICTIONAL_RECOVERY_SENDER,
      RECOVERY_EMAIL_REPLY_TO: FICTIONAL_RECOVERY_REPLY_TO,
      BACKOFFICE_ORIGIN: "https://staging.purosur.online",
      EDGE_ORIGIN_SECRET: "edge-secret",
      ARCA_CERTIFICATE: ARCA_CERTIFICATE_WITH_WRONG_CHECK_DIGIT,
    };

    await expect(
      startServer(env, {
        arcaEndpoints: unreachableArcaEndpoints,
        initSentry: vi.fn(),
        buildApp,
        setUpBackgroundJobs,
      }),
    ).rejects.toThrow("ARCA_CERTIFICATE's CUIT must have a correct check digit");
    expect(setUpBackgroundJobs).not.toHaveBeenCalled();
    expect(buildApp).not.toHaveBeenCalled();
  });

  it("wires the resolved background job infrastructure into the app and closes it when the app closes", async () => {
    const listen = vi.fn().mockResolvedValue(undefined);
    const fakeApp = appListeningBy(listen);
    const buildApp = vi.fn().mockReturnValue(fakeApp);
    const close = vi.fn().mockResolvedValue(undefined);
    const fakeBackgroundJobs = {
      db: { marker: "fake-db" },
      connections: { withConnection: vi.fn() },
      jobQueue: { enqueueRecoveryRequest: vi.fn() },
      backofficeOrigin: "https://staging.purosur.online",
      worker: { stop: vi.fn() },
      workerUtils: { addJob: vi.fn() },
      close,
    };
    const setUpBackgroundJobs = vi.fn().mockResolvedValue(fakeBackgroundJobs);

    const env = {
      DATABASE_URL: "postgres://user:pass@db/purosur",
      RESEND_API_KEY: "re_test_key",
      RECOVERY_EMAIL_FROM: FICTIONAL_RECOVERY_SENDER,
      RECOVERY_EMAIL_REPLY_TO: FICTIONAL_RECOVERY_REPLY_TO,
      BACKOFFICE_ORIGIN: "https://staging.purosur.online",
      EDGE_ORIGIN_SECRET: "edge-secret",
      RELEASE_CHECK_TOKEN: "release-check-token",
      OFFSITE_DUMP_CHECK_TOKEN: "offsite-dump-check-token",
      ARCA_CERTIFICATE: VALID_ARCA_CERTIFICATE,
      ARCA_ENVIRONMENT: "homologation",
      DEVICE_TOKEN_ROTATION_KEY: ROTATION_KEY,
      INSTALLATION_KEYS_ENCRYPTION_KEY: KEYS_ENCRYPTION_KEY,
    };

    await startServer(env, {
      arcaEndpoints: arcaEndpointsOf,
      initSentry: vi.fn(),
      buildApp,
      setUpBackgroundJobs,
      recordAuthorizedCuit: vi.fn().mockResolvedValue(undefined),
      enqueueMissingTaxAuthorityCounts: vi.fn().mockResolvedValue(undefined),
      enqueueMissingUnclearOutcomes: vi.fn().mockResolvedValue(undefined),
      enqueueMissingNumberingConflicts: vi.fn().mockResolvedValue(undefined),
      enqueueMissingCreditNotes: vi.fn().mockResolvedValue(undefined),
      now,
    });

    expect(setUpBackgroundJobs).toHaveBeenCalledWith(
      {
        databaseUrl: "postgres://user:pass@db/purosur",
        emailSender: { transport: "resend", resendApiKey: "re_test_key" },
        emailFrom: FICTIONAL_RECOVERY_SENDER,
        emailReplyTo: FICTIONAL_RECOVERY_REPLY_TO,
        backofficeOrigin: "https://staging.purosur.online",
        arcaCertificate: {
          environment: "homologation",
          notAfter: VALID_ARCA_CERTIFICATE_NOT_AFTER,
        },
        arcaVitality: { endpoint: "https://wswhomo.afip.gov.ar/wsfev1/service.asmx" },
        offsiteDumpCheck: { environment: "homologation" },
      },
      now,
    );
    expect(buildApp).toHaveBeenCalledWith({
      version: "unknown",
      now,
      edgeOriginSecret: "edge-secret",
      staticDir: undefined,
      recovery: {
        db: fakeBackgroundJobs.db,
        jobQueue: fakeBackgroundJobs.jobQueue,
        backofficeOrigin: fakeBackgroundJobs.backofficeOrigin,
      },
      session: {
        db: fakeBackgroundJobs.db,
        backofficeOrigin: fakeBackgroundJobs.backofficeOrigin,
      },
      passkeys: {
        db: fakeBackgroundJobs.db,
        backofficeOrigin: fakeBackgroundJobs.backofficeOrigin,
      },
      users: {
        db: fakeBackgroundJobs.db,
        backofficeOrigin: fakeBackgroundJobs.backofficeOrigin,
      },
      registersPointsOfSale: {
        db: fakeBackgroundJobs.db,
        backofficeOrigin: fakeBackgroundJobs.backofficeOrigin,
      },
      roles: {
        db: fakeBackgroundJobs.db,
        backofficeOrigin: fakeBackgroundJobs.backofficeOrigin,
      },
      branchSettings: {
        db: fakeBackgroundJobs.db,
        backofficeOrigin: fakeBackgroundJobs.backofficeOrigin,
      },
      issuerIdentification: {
        db: fakeBackgroundJobs.db,
        backofficeOrigin: fakeBackgroundJobs.backofficeOrigin,
        authorizedCuit: FICTIONAL_CERTIFICATE_CUIT,
      },
      buyerIdentificationThresholds: {
        db: fakeBackgroundJobs.db,
        backofficeOrigin: fakeBackgroundJobs.backofficeOrigin,
      },
      fiscalAddresses: {
        db: fakeBackgroundJobs.db,
        backofficeOrigin: fakeBackgroundJobs.backofficeOrigin,
      },
      categories: {
        db: fakeBackgroundJobs.db,
        backofficeOrigin: fakeBackgroundJobs.backofficeOrigin,
      },
      brands: {
        db: fakeBackgroundJobs.db,
        backofficeOrigin: fakeBackgroundJobs.backofficeOrigin,
      },
      tags: {
        db: fakeBackgroundJobs.db,
        backofficeOrigin: fakeBackgroundJobs.backofficeOrigin,
      },
      products: {
        db: fakeBackgroundJobs.db,
        backofficeOrigin: fakeBackgroundJobs.backofficeOrigin,
      },
      alerts: {
        db: fakeBackgroundJobs.db,
        backofficeOrigin: fakeBackgroundJobs.backofficeOrigin,
      },
      quarantinedEvents: {
        db: fakeBackgroundJobs.db,
        backofficeOrigin: fakeBackgroundJobs.backofficeOrigin,
      },
      registersBelowMinimum: {
        db: fakeBackgroundJobs.db,
        releaseCheckToken: "release-check-token",
      },
      readableEventVersions: {
        releaseCheckToken: "release-check-token",
      },
      offsiteDumpChecks: {
        db: fakeBackgroundJobs.db,
        offsiteDumpCheckToken: "offsite-dump-check-token",
      },
      prices: {
        db: fakeBackgroundJobs.db,
        backofficeOrigin: fakeBackgroundJobs.backofficeOrigin,
      },
      discounts: {
        db: fakeBackgroundJobs.db,
        backofficeOrigin: fakeBackgroundJobs.backofficeOrigin,
      },
      restoredOrphanSweep: {
        connections: fakeBackgroundJobs.connections,
        enqueueCreditNote: enqueueCreditNoteJob,
      },
      registers: {
        db: fakeBackgroundJobs.db,
        backofficeOrigin: fakeBackgroundJobs.backofficeOrigin,
      },
      snapshotBackups: {
        db: fakeBackgroundJobs.db,
        backofficeOrigin: fakeBackgroundJobs.backofficeOrigin,
        keysEncryptionKey: KEYS_ENCRYPTION_KEY_BYTES,
      },
      registerRevocations: {
        db: fakeBackgroundJobs.db,
        backofficeOrigin: fakeBackgroundJobs.backofficeOrigin,
        keysEncryptionKey: KEYS_ENCRYPTION_KEY_BYTES,
      },
      compromiseResponses: {
        db: fakeBackgroundJobs.db,
        backofficeOrigin: fakeBackgroundJobs.backofficeOrigin,
        keysEncryptionKey: KEYS_ENCRYPTION_KEY_BYTES,
      },
      bitlockerRecoveryKeys: {
        db: fakeBackgroundJobs.db,
        backofficeOrigin: fakeBackgroundJobs.backofficeOrigin,
        keysEncryptionKey: KEYS_ENCRYPTION_KEY_BYTES,
      },
      stock: {
        db: fakeBackgroundJobs.db,
        backofficeOrigin: fakeBackgroundJobs.backofficeOrigin,
      },
      purchasing: {
        db: fakeBackgroundJobs.db,
        backofficeOrigin: fakeBackgroundJobs.backofficeOrigin,
      },
      salesReports: {
        db: fakeBackgroundJobs.db,
        backofficeOrigin: fakeBackgroundJobs.backofficeOrigin,
      },
      paymentsReports: {
        db: fakeBackgroundJobs.db,
        backofficeOrigin: fakeBackgroundJobs.backofficeOrigin,
      },
      refunds: {
        db: fakeBackgroundJobs.db,
        backofficeOrigin: fakeBackgroundJobs.backofficeOrigin,
      },
      devices: {
        db: fakeBackgroundJobs.db,
        rotationKey: ROTATION_KEY_BYTES,
        keysEncryptionKey: KEYS_ENCRYPTION_KEY_BYTES,
      },
      firstPinCodes: {
        db: fakeBackgroundJobs.db,
        rotationKey: ROTATION_KEY_BYTES,
        keysEncryptionKey: KEYS_ENCRYPTION_KEY_BYTES,
      },
      health: {
        db: fakeBackgroundJobs.db,
        certificateFingerprint: new X509Certificate(VALID_ARCA_CERTIFICATE).fingerprint256,
      },
      mercadoPagoOrders: { connections: fakeBackgroundJobs.connections },
      mercadoPagoNotifications: {
        db: fakeBackgroundJobs.db,
        connections: fakeBackgroundJobs.connections,
      },
    });

    await fakeApp.close();
    expect(close).toHaveBeenCalledTimes(1);
  });
});

describe("startServer checking the offsite dump", () => {
  const env = {
    DATABASE_URL: "postgres://user:pass@db/purosur",
    RESEND_API_KEY: "re_test_key",
    RECOVERY_EMAIL_FROM: FICTIONAL_RECOVERY_SENDER,
    RECOVERY_EMAIL_REPLY_TO: FICTIONAL_RECOVERY_REPLY_TO,
    BACKOFFICE_ORIGIN: "https://staging.purosur.online",
    EDGE_ORIGIN_SECRET: "edge-secret",
    ARCA_CERTIFICATE: VALID_ARCA_CERTIFICATE,
    ARCA_ENVIRONMENT: "homologation",
    DEVICE_TOKEN_ROTATION_KEY: ROTATION_KEY,
    INSTALLATION_KEYS_ENCRYPTION_KEY: KEYS_ENCRYPTION_KEY,
  };

  async function start(extraEnv: Record<string, string>) {
    const buildApp = vi.fn().mockReturnValue(appListeningBy(vi.fn().mockResolvedValue(undefined)));
    const setUpBackgroundJobs = vi.fn().mockResolvedValue({
      db: {},
      jobQueue: { enqueueRecoveryRequest: vi.fn() },
      backofficeOrigin: "https://staging.purosur.online",
      worker: { stop: vi.fn() },
      workerUtils: { addJob: vi.fn() },
      close: vi.fn(),
    });
    await startServer(
      { ...env, ...extraEnv },
      {
        arcaEndpoints: arcaEndpointsOf,
        initSentry: vi.fn(),
        buildApp,
        setUpBackgroundJobs,
        recordAuthorizedCuit: vi.fn().mockResolvedValue(undefined),
        enqueueMissingTaxAuthorityCounts: vi.fn().mockResolvedValue(undefined),
        enqueueMissingUnclearOutcomes: vi.fn().mockResolvedValue(undefined),
        enqueueMissingNumberingConflicts: vi.fn().mockResolvedValue(undefined),
        enqueueMissingCreditNotes: vi.fn().mockResolvedValue(undefined),
      },
    );
    return { buildApp, setUpBackgroundJobs };
  }

  it("sets up the detection for the certificate's environment when the token is configured", async () => {
    const { setUpBackgroundJobs } = await start({ OFFSITE_DUMP_CHECK_TOKEN: "offsite-token" });

    expect(setUpBackgroundJobs).toHaveBeenCalledWith(
      expect.objectContaining({ offsiteDumpCheck: { environment: "homologation" } }),
      expect.any(Function),
    );
  });

  it("sets up no detection without the token, so no alert is ever raised there", async () => {
    const { setUpBackgroundJobs } = await start({});

    const [backgroundJobsEnv] = setUpBackgroundJobs.mock.calls[0] as [Record<string, unknown>];
    expect(backgroundJobsEnv).not.toHaveProperty("offsiteDumpCheck");
  });

  it("gives the report route no token when it is not configured", async () => {
    const { buildApp } = await start({});

    const [options] = buildApp.mock.calls[0] as [
      { offsiteDumpChecks: { offsiteDumpCheckToken?: string } },
    ];
    expect(options.offsiteDumpChecks.offsiteDumpCheckToken).toBeUndefined();
  });
});

describe("startServer recording the certificate's CUIT", () => {
  const env = {
    DATABASE_URL: "postgres://user:pass@db/purosur",
    RESEND_API_KEY: "re_test_key",
    RECOVERY_EMAIL_FROM: FICTIONAL_RECOVERY_SENDER,
    RECOVERY_EMAIL_REPLY_TO: FICTIONAL_RECOVERY_REPLY_TO,
    BACKOFFICE_ORIGIN: "https://staging.purosur.online",
    EDGE_ORIGIN_SECRET: "edge-secret",
    ARCA_CERTIFICATE: VALID_ARCA_CERTIFICATE,
    ARCA_ENVIRONMENT: "homologation",
    DEVICE_TOKEN_ROTATION_KEY: ROTATION_KEY,
    INSTALLATION_KEYS_ENCRYPTION_KEY: KEYS_ENCRYPTION_KEY,
  };

  it("records the certificate's CUIT for the issuer identification before it starts listening", async () => {
    const steps: string[] = [];
    const fakeApp = appListeningBy(
      vi.fn(async () => {
        steps.push("listen");
      }),
    );
    const db = { marker: "fake-db" };
    const setUpBackgroundJobs = vi.fn().mockResolvedValue({
      db,
      jobQueue: { enqueueRecoveryRequest: vi.fn() },
      backofficeOrigin: "https://staging.purosur.online",
      worker: { stop: vi.fn() },
      workerUtils: { addJob: vi.fn() },
      close: vi.fn(),
    });
    const recordAuthorizedCuit = vi.fn(async () => {
      steps.push("recordAuthorizedCuit");
    });

    await startServer(env, {
      arcaEndpoints: unreachableArcaEndpoints,
      initSentry: vi.fn(),
      buildApp: vi.fn().mockReturnValue(fakeApp),
      setUpBackgroundJobs,
      recordAuthorizedCuit,
    });

    expect(recordAuthorizedCuit).toHaveBeenCalledWith(db, FICTIONAL_CERTIFICATE_CUIT);
    expect(steps).toEqual(["recordAuthorizedCuit", "listen"]);
  });

  it("records no CUIT when no database is configured", async () => {
    const recordAuthorizedCuit = vi.fn();
    const fakeApp = appListeningBy(vi.fn().mockResolvedValue(undefined));

    await startServer(
      { EDGE_ORIGIN_SECRET: "edge-secret" },
      {
        arcaEndpoints: unreachableArcaEndpoints,
        initSentry: vi.fn(),
        buildApp: vi.fn().mockReturnValue(fakeApp),
        recordAuthorizedCuit,
      },
    );

    expect(recordAuthorizedCuit).not.toHaveBeenCalled();
  });
});

describe("startServer checking the certificate's expiry", () => {
  const env = {
    DATABASE_URL: "postgres://user:pass@db/purosur",
    RESEND_API_KEY: "re_test_key",
    RECOVERY_EMAIL_FROM: FICTIONAL_RECOVERY_SENDER,
    RECOVERY_EMAIL_REPLY_TO: FICTIONAL_RECOVERY_REPLY_TO,
    BACKOFFICE_ORIGIN: "https://staging.purosur.online",
    EDGE_ORIGIN_SECRET: "edge-secret",
    ARCA_CERTIFICATE: VALID_ARCA_CERTIFICATE,
    ARCA_ENVIRONMENT: "homologation",
    DEVICE_TOKEN_ROTATION_KEY: ROTATION_KEY,
    INSTALLATION_KEYS_ENCRYPTION_KEY: KEYS_ENCRYPTION_KEY,
  };

  it("enqueues the check on the started job queue before it starts listening", async () => {
    const steps: string[] = [];
    const fakeApp = appListeningBy(
      vi.fn(async () => {
        steps.push("listen");
      }),
    );
    const backgroundJobs = {
      db: { marker: "fake-db" },
      jobQueue: { enqueueRecoveryRequest: vi.fn() },
      backofficeOrigin: "https://staging.purosur.online",
      worker: { stop: vi.fn() },
      workerUtils: { marker: "fake-worker-utils" },
      close: vi.fn(),
    };
    const enqueueArcaCertificateExpiryCheck = vi.fn(async () => {
      steps.push("enqueueArcaCertificateExpiryCheck");
    });

    await startServer(env, {
      arcaEndpoints: unreachableArcaEndpoints,
      initSentry: vi.fn(),
      buildApp: vi.fn().mockReturnValue(fakeApp),
      setUpBackgroundJobs: vi.fn().mockResolvedValue(backgroundJobs),
      recordAuthorizedCuit: vi.fn().mockResolvedValue(undefined),
      enqueueMissingTaxAuthorityCounts: vi.fn().mockResolvedValue(undefined),
      enqueueMissingUnclearOutcomes: vi.fn().mockResolvedValue(undefined),
      enqueueMissingNumberingConflicts: vi.fn().mockResolvedValue(undefined),
      enqueueMissingCreditNotes: vi.fn().mockResolvedValue(undefined),
      enqueueArcaCertificateExpiryCheck,
    });

    expect(enqueueArcaCertificateExpiryCheck).toHaveBeenCalledWith(backgroundJobs.workerUtils);
    expect(steps).toEqual(["enqueueArcaCertificateExpiryCheck", "listen"]);
  });

  it("refuses to start when ARCA_ENVIRONMENT is not valid, before opening any database or job-queue resource", async () => {
    const setUpBackgroundJobs = vi.fn();

    await expect(
      startServer(
        { ...env, ARCA_ENVIRONMENT: "staging" },
        {
          arcaEndpoints: unreachableArcaEndpoints,
          initSentry: vi.fn(),
          buildApp: vi.fn(),
          setUpBackgroundJobs,
        },
      ),
    ).rejects.toThrow('ARCA_ENVIRONMENT must be "homologation" or "production"');
    expect(setUpBackgroundJobs).not.toHaveBeenCalled();
  });

  it("refuses to start when ARCA_ENVIRONMENT is not set", async () => {
    const { ARCA_ENVIRONMENT: _omitted, ...withoutEnvironment } = env;

    await expect(
      startServer(withoutEnvironment, {
        arcaEndpoints: unreachableArcaEndpoints,
        initSentry: vi.fn(),
        buildApp: vi.fn(),
        setUpBackgroundJobs: vi.fn(),
      }),
    ).rejects.toThrow("ARCA_ENVIRONMENT must be set once DATABASE_URL is configured");
  });
});

describe("startServer with the ARCA private key", () => {
  const credentials = generateArcaTestCredentials();
  const baseEnv = {
    DATABASE_URL: "postgres://user:pass@db/purosur",
    RESEND_API_KEY: "re_test_key",
    RECOVERY_EMAIL_FROM: FICTIONAL_RECOVERY_SENDER,
    RECOVERY_EMAIL_REPLY_TO: FICTIONAL_RECOVERY_REPLY_TO,
    BACKOFFICE_ORIGIN: "https://staging.purosur.online",
    EDGE_ORIGIN_SECRET: "edge-secret",
    ARCA_CERTIFICATE: credentials.certificatePem,
    ARCA_ENVIRONMENT: "homologation",
    DEVICE_TOKEN_ROTATION_KEY: ROTATION_KEY,
    INSTALLATION_KEYS_ENCRYPTION_KEY: KEYS_ENCRYPTION_KEY,
  };

  function start(env: Record<string, string>) {
    const fakeApp = appListeningBy(vi.fn().mockResolvedValue(undefined));
    const setUpBackgroundJobs = vi.fn().mockResolvedValue({
      db: {},
      jobQueue: { enqueueRecoveryRequest: vi.fn() },
      backofficeOrigin: "https://staging.purosur.online",
      worker: { stop: vi.fn() },
      workerUtils: { addJob: vi.fn() },
      close: vi.fn(),
    });
    const started = startServer(env, {
      arcaEndpoints: arcaEndpointsOf,
      initSentry: vi.fn(),
      buildApp: vi.fn().mockReturnValue(fakeApp),
      setUpBackgroundJobs,
      recordAuthorizedCuit: vi.fn().mockResolvedValue(undefined),
      enqueueMissingTaxAuthorityCounts: vi.fn().mockResolvedValue(undefined),
      enqueueMissingUnclearOutcomes: vi.fn().mockResolvedValue(undefined),
      enqueueMissingNumberingConflicts: vi.fn().mockResolvedValue(undefined),
      enqueueMissingCreditNotes: vi.fn().mockResolvedValue(undefined),
    });
    return { started, setUpBackgroundJobs };
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sets up the WSAA token renewal with the certificate, its key and its fingerprint in homologation", async () => {
    const { started, setUpBackgroundJobs } = start({
      ...baseEnv,
      ARCA_PRIVATE_KEY: credentials.privateKeyPem,
    });
    await started;

    expect(setUpBackgroundJobs).toHaveBeenCalledWith(
      expect.objectContaining({
        arcaWsaa: {
          endpoint: "https://wsaahomo.afip.gov.ar/ws/services/LoginCms",
          certificatePem: credentials.certificatePem,
          privateKeyPem: credentials.privateKeyPem,
          certificateFingerprint: credentials.fingerprint,
        },
      }),
      expect.any(Function),
    );
  });

  it("uses ARCA's production WSAA in production", async () => {
    const { started, setUpBackgroundJobs } = start({
      ...baseEnv,
      ARCA_ENVIRONMENT: "production",
      ARCA_PRIVATE_KEY: credentials.privateKeyPem,
    });
    await started;

    expect(setUpBackgroundJobs).toHaveBeenCalledWith(
      expect.objectContaining({
        arcaWsaa: expect.objectContaining({
          endpoint: "https://wsaa.afip.gov.ar/ws/services/LoginCms",
        }),
      }),
      expect.any(Function),
    );
  });

  it("accepts the key and the certificate collapsed to one line with literal \\n sequences", async () => {
    const { started, setUpBackgroundJobs } = start({
      ...baseEnv,
      ARCA_CERTIFICATE: credentials.certificatePem.trimEnd().split("\n").join("\\n"),
      ARCA_PRIVATE_KEY: credentials.privateKeyPem.trimEnd().split("\n").join("\\n"),
    });
    await started;

    expect(setUpBackgroundJobs).toHaveBeenCalledWith(
      expect.objectContaining({
        arcaWsaa: expect.objectContaining({
          privateKeyPem: credentials.privateKeyPem.trimEnd(),
          certificateFingerprint: credentials.fingerprint,
        }),
      }),
      expect.any(Function),
    );
  });

  it("refuses to start in production without the key, before opening any resource", async () => {
    const { started, setUpBackgroundJobs } = start({ ...baseEnv, ARCA_ENVIRONMENT: "production" });

    await expect(started).rejects.toThrow(
      "ARCA_PRIVATE_KEY must be set when ARCA_ENVIRONMENT is production",
    );
    expect(setUpBackgroundJobs).not.toHaveBeenCalled();
  });

  it("starts in homologation without the key, sets up no renewal and warns once", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { started, setUpBackgroundJobs } = start(baseEnv);
    await started;

    const [backgroundJobsEnv] = setUpBackgroundJobs.mock.calls[0] as [Record<string, unknown>];
    expect(backgroundJobsEnv).not.toHaveProperty("arcaWsaa");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("ARCA_PRIVATE_KEY"));
  });

  it("does not warn when the key is set", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { started } = start({ ...baseEnv, ARCA_PRIVATE_KEY: credentials.privateKeyPem });
    await started;

    expect(warn).not.toHaveBeenCalled();
  });

  it.each(["homologation", "production"])(
    "refuses to start in %s when the key is not a PEM private key",
    async (environment) => {
      const { started, setUpBackgroundJobs } = start({
        ...baseEnv,
        ARCA_ENVIRONMENT: environment,
        ARCA_PRIVATE_KEY: "not a key",
      });

      await expect(started).rejects.toThrow("ARCA_PRIVATE_KEY must be a valid PEM private key");
      expect(setUpBackgroundJobs).not.toHaveBeenCalled();
    },
  );

  it("refuses to start when the key does not belong to the certificate", async () => {
    const { started, setUpBackgroundJobs } = start({
      ...baseEnv,
      ARCA_PRIVATE_KEY: generateArcaTestCredentials().privateKeyPem,
    });

    await expect(started).rejects.toThrow(
      "ARCA_PRIVATE_KEY must match ARCA_CERTIFICATE's public key",
    );
    expect(setUpBackgroundJobs).not.toHaveBeenCalled();
  });

  it("refuses to start when the key is not an RSA key", async () => {
    const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const { started, setUpBackgroundJobs } = start({
      ...baseEnv,
      ARCA_PRIVATE_KEY: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    });

    await expect(started).rejects.toThrow("ARCA_PRIVATE_KEY must be an RSA private key");
    expect(setUpBackgroundJobs).not.toHaveBeenCalled();
  });

  it("asks for no key when no database is configured", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fakeApp = appListeningBy(vi.fn().mockResolvedValue(undefined));

    await startServer(
      { EDGE_ORIGIN_SECRET: "edge-secret" },
      {
        arcaEndpoints: unreachableArcaEndpoints,
        initSentry: vi.fn(),
        buildApp: vi.fn().mockReturnValue(fakeApp),
      },
    );

    expect(warn).not.toHaveBeenCalled();
  });
});

describe("startServer fetching the buyer tax-status values", () => {
  const credentials = generateArcaTestCredentials();
  const env = {
    DATABASE_URL: "postgres://user:pass@db/purosur",
    RESEND_API_KEY: "re_test_key",
    RECOVERY_EMAIL_FROM: FICTIONAL_RECOVERY_SENDER,
    RECOVERY_EMAIL_REPLY_TO: FICTIONAL_RECOVERY_REPLY_TO,
    BACKOFFICE_ORIGIN: "https://staging.purosur.online",
    EDGE_ORIGIN_SECRET: "edge-secret",
    ARCA_CERTIFICATE: credentials.certificatePem,
    ARCA_ENVIRONMENT: "homologation",
    DEVICE_TOKEN_ROTATION_KEY: ROTATION_KEY,
    INSTALLATION_KEYS_ENCRYPTION_KEY: KEYS_ENCRYPTION_KEY,
  };

  function start(startEnv: Record<string, string>) {
    const steps: string[] = [];
    const fakeApp = appListeningBy(
      vi.fn(async () => {
        steps.push("listen");
      }),
    );
    const backgroundJobs = {
      db: {},
      jobQueue: { enqueueRecoveryRequest: vi.fn() },
      backofficeOrigin: "https://staging.purosur.online",
      worker: { stop: vi.fn() },
      workerUtils: { addJob: vi.fn() },
      close: vi.fn(),
    };
    const setUpBackgroundJobs = vi.fn().mockResolvedValue(backgroundJobs);
    const enqueueBuyerTaxStatusFetch = vi.fn(async () => {
      steps.push("enqueueBuyerTaxStatusFetch");
    });
    const started = startServer(startEnv, {
      arcaEndpoints: arcaEndpointsOf,
      initSentry: vi.fn(),
      buildApp: vi.fn().mockReturnValue(fakeApp),
      setUpBackgroundJobs,
      recordAuthorizedCuit: vi.fn().mockResolvedValue(undefined),
      enqueueMissingTaxAuthorityCounts: vi.fn().mockResolvedValue(undefined),
      enqueueMissingUnclearOutcomes: vi.fn().mockResolvedValue(undefined),
      enqueueMissingNumberingConflicts: vi.fn().mockResolvedValue(undefined),
      enqueueMissingCreditNotes: vi.fn().mockResolvedValue(undefined),
      enqueueBuyerTaxStatusFetch,
    });
    return { started, steps, backgroundJobs, setUpBackgroundJobs, enqueueBuyerTaxStatusFetch };
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sets up the fetch from the environment's WSFE with the certificate's CUIT and fingerprint", async () => {
    const { started, setUpBackgroundJobs } = start({
      ...env,
      ARCA_PRIVATE_KEY: credentials.privateKeyPem,
    });
    await started;

    expect(setUpBackgroundJobs).toHaveBeenCalledWith(
      expect.objectContaining({
        arcaBuyerTaxStatus: {
          endpoint: "https://wswhomo.afip.gov.ar/wsfev1/service.asmx",
          cuit: FICTIONAL_CERTIFICATE_CUIT,
          certificateFingerprint: credentials.fingerprint,
        },
      }),
      expect.any(Function),
    );
  });

  it("fetches once on the started job queue before it starts listening", async () => {
    const { started, steps, backgroundJobs, enqueueBuyerTaxStatusFetch } = start({
      ...env,
      ARCA_PRIVATE_KEY: credentials.privateKeyPem,
    });
    await started;

    expect(enqueueBuyerTaxStatusFetch).toHaveBeenCalledWith(backgroundJobs.workerUtils);
    expect(steps).toEqual(["enqueueBuyerTaxStatusFetch", "listen"]);
  });

  it("sets up no fetch without the key, as no WSAA token is ever renewed to fetch with", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { started, setUpBackgroundJobs, enqueueBuyerTaxStatusFetch } = start(env);
    await started;

    const [backgroundJobsEnv] = setUpBackgroundJobs.mock.calls[0] as [Record<string, unknown>];
    expect(backgroundJobsEnv).not.toHaveProperty("arcaBuyerTaxStatus");
    expect(enqueueBuyerTaxStatusFetch).not.toHaveBeenCalled();
  });
});

describe("startServer authorizing sales in real time", () => {
  const credentials = generateArcaTestCredentials();
  const env = {
    DATABASE_URL: "postgres://user:pass@db/purosur",
    RESEND_API_KEY: "re_test_key",
    RECOVERY_EMAIL_FROM: FICTIONAL_RECOVERY_SENDER,
    RECOVERY_EMAIL_REPLY_TO: FICTIONAL_RECOVERY_REPLY_TO,
    BACKOFFICE_ORIGIN: "https://staging.purosur.online",
    EDGE_ORIGIN_SECRET: "edge-secret",
    ARCA_CERTIFICATE: credentials.certificatePem,
    ARCA_ENVIRONMENT: "homologation",
    DEVICE_TOKEN_ROTATION_KEY: ROTATION_KEY,
    INSTALLATION_KEYS_ENCRYPTION_KEY: KEYS_ENCRYPTION_KEY,
  };

  function start(startEnv: Record<string, string>) {
    const steps: string[] = [];
    const fakeApp = appListeningBy(
      vi.fn(async () => {
        steps.push("listen");
      }),
    );
    const backgroundJobs = {
      db: {},
      connections: { withConnection: vi.fn() },
      jobQueue: { enqueueRecoveryRequest: vi.fn() },
      backofficeOrigin: "https://staging.purosur.online",
      worker: { stop: vi.fn() },
      workerUtils: { addJob: vi.fn() },
      close: vi.fn(),
    };
    const setUpBackgroundJobs = vi.fn().mockResolvedValue(backgroundJobs);
    const buildApp = vi.fn().mockReturnValue(fakeApp);
    const enqueueMissingTaxAuthorityCounts = vi.fn(async () => {
      steps.push("enqueueMissingTaxAuthorityCounts");
    });
    const enqueueMissingUnclearOutcomes = vi.fn(async () => {
      steps.push("enqueueMissingUnclearOutcomes");
    });
    const enqueueMissingNumberingConflicts = vi.fn(async () => {
      steps.push("enqueueMissingNumberingConflicts");
    });
    const enqueueMissingCreditNotes = vi.fn(async () => {
      steps.push("enqueueMissingCreditNotes");
    });
    const started = startServer(startEnv, {
      arcaEndpoints: arcaEndpointsOf,
      initSentry: vi.fn(),
      buildApp,
      setUpBackgroundJobs,
      recordAuthorizedCuit: vi.fn().mockResolvedValue(undefined),
      enqueueBuyerTaxStatusFetch: vi.fn().mockResolvedValue(undefined),
      enqueueMissingTaxAuthorityCounts,
      enqueueMissingUnclearOutcomes,
      enqueueMissingNumberingConflicts,
      enqueueMissingCreditNotes,
    });
    return {
      started,
      steps,
      backgroundJobs,
      setUpBackgroundJobs,
      buildApp,
      enqueueMissingTaxAuthorityCounts,
      enqueueMissingUnclearOutcomes,
      enqueueMissingNumberingConflicts,
      enqueueMissingCreditNotes,
    };
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sets up the count of the tax authority's last authorized number from the environment's WSFE with the certificate's CUIT and fingerprint", async () => {
    const { started, setUpBackgroundJobs } = start({
      ...env,
      ARCA_PRIVATE_KEY: credentials.privateKeyPem,
    });
    await started;

    expect(setUpBackgroundJobs).toHaveBeenCalledWith(
      expect.objectContaining({
        arcaInvoicing: {
          endpoint: "https://wswhomo.afip.gov.ar/wsfev1/service.asmx",
          cuit: FICTIONAL_CERTIFICATE_CUIT,
          certificateFingerprint: credentials.fingerprint,
        },
      }),
      expect.any(Function),
    );
  });

  it("gives the app the authorization route, with a dedicated connection per point of sale lane, the WSFE invoicing and the certificate's fingerprint", async () => {
    const { started, buildApp, backgroundJobs } = start({
      ...env,
      ARCA_PRIVATE_KEY: credentials.privateKeyPem,
    });
    await started;

    const [options] = buildApp.mock.calls[0] as [BuildAppOptions];
    expect(options.fiscalAuthorization).toEqual({
      connections: backgroundJobs.connections,
      taxAuthority: expect.any(WsfeTaxAuthorityInvoicing),
      certificateFingerprint: credentials.fingerprint,
      enqueueUnclearOutcome: enqueueUnclearOutcomeJob,
      withdrawUnclearOutcome: withdrawUnclearOutcomeJob,
      enqueueNumberingDiagnosis: enqueueNumberingDiagnosisJob,
      enqueueCreditNote: enqueueCreditNoteJob,
    });
  });

  it("gives the app the restored register orphan sweep route, with a dedicated connection per point of sale lane and the credit note queue", async () => {
    const { started, buildApp, backgroundJobs } = start(env);
    await started;

    const [options] = buildApp.mock.calls[0] as [BuildAppOptions];
    expect(options.restoredOrphanSweep).toEqual({
      connections: backgroundJobs.connections,
      enqueueCreditNote: enqueueCreditNoteJob,
    });
  });

  it("has the configuration of a register's point of sale enqueue the tax authority's count", async () => {
    const { started, buildApp, backgroundJobs } = start({
      ...env,
      ARCA_PRIVATE_KEY: credentials.privateKeyPem,
    });
    await started;

    const [options] = buildApp.mock.calls[0] as [BuildAppOptions];
    expect(options.registersPointsOfSale).toEqual({
      db: backgroundJobs.db,
      backofficeOrigin: "https://staging.purosur.online",
      enqueueTaxAuthorityCount: enqueueTaxAuthorityCountJob,
    });
  });

  it("has a register's pull request the missing offline authorization code", async () => {
    const { started, buildApp } = start({
      ...env,
      ARCA_PRIVATE_KEY: credentials.privateKeyPem,
    });
    await started;

    const [options] = buildApp.mock.calls[0] as [BuildAppOptions];
    expect(options.enqueueOfflineAuthorizationCodeRequest).toBe(
      enqueueOfflineAuthorizationCodeRequest,
    );
  });

  it("has an installation's enrollment ask the tax authority for its point of sale's count", async () => {
    const { started, buildApp } = start({
      ...env,
      ARCA_PRIVATE_KEY: credentials.privateKeyPem,
    });
    await started;

    const [options] = buildApp.mock.calls[0] as [BuildAppOptions];
    expect(options.enqueueTaxAuthorityCountOnEnrollment).toBe(enqueueTaxAuthorityCountJob);
  });

  it("has an installation's enrollment put its point of sale's numbering under reconciliation", async () => {
    const { started, buildApp } = start({
      ...env,
      ARCA_PRIVATE_KEY: credentials.privateKeyPem,
    });
    await started;

    const [options] = buildApp.mock.calls[0] as [BuildAppOptions];
    expect(options.enqueueNumberingReconciliationOnEnrollment).toBe(
      enqueueNumberingReconciliationJob,
    );
  });

  it("asks again for the count of every claimed point of sale that has none before it starts listening", async () => {
    const { started, steps, backgroundJobs, enqueueMissingTaxAuthorityCounts } = start({
      ...env,
      ARCA_PRIVATE_KEY: credentials.privateKeyPem,
    });
    await started;

    expect(enqueueMissingTaxAuthorityCounts).toHaveBeenCalledWith(backgroundJobs.db);
    expect(steps).toEqual([
      "enqueueMissingTaxAuthorityCounts",
      "enqueueMissingUnclearOutcomes",
      "enqueueMissingNumberingConflicts",
      "enqueueMissingCreditNotes",
      "listen",
    ]);
  });

  it("asks again for the decision of every unclear document that is still undecided", async () => {
    const { started, backgroundJobs, enqueueMissingUnclearOutcomes } = start({
      ...env,
      ARCA_PRIVATE_KEY: credentials.privateKeyPem,
    });
    await started;

    expect(enqueueMissingUnclearOutcomes).toHaveBeenCalledWith(backgroundJobs.db);
  });

  it("asks again for the numbering conflict work still owed before it starts listening", async () => {
    const { started, backgroundJobs, enqueueMissingNumberingConflicts } = start({
      ...env,
      ARCA_PRIVATE_KEY: credentials.privateKeyPem,
    });
    await started;

    expect(enqueueMissingNumberingConflicts).toHaveBeenCalledWith(backgroundJobs.db);
  });

  it("asks again for every credit note still to be issued before it starts listening", async () => {
    const { started, backgroundJobs, enqueueMissingCreditNotes } = start({
      ...env,
      ARCA_PRIVATE_KEY: credentials.privateKeyPem,
    });
    await started;

    expect(enqueueMissingCreditNotes).toHaveBeenCalledWith(backgroundJobs.db);
  });

  it("wires none of it without the key, as no WSAA token is ever renewed to ask with", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const {
      started,
      setUpBackgroundJobs,
      buildApp,
      enqueueMissingTaxAuthorityCounts,
      enqueueMissingUnclearOutcomes,
    } = start(env);
    await started;

    const [backgroundJobsEnv] = setUpBackgroundJobs.mock.calls[0] as [Record<string, unknown>];
    expect(backgroundJobsEnv).not.toHaveProperty("arcaInvoicing");
    const [options] = buildApp.mock.calls[0] as [BuildAppOptions];
    expect(options).not.toHaveProperty("fiscalAuthorization");
    expect(options.registersPointsOfSale).not.toHaveProperty("enqueueTaxAuthorityCount");
    expect(options).not.toHaveProperty("enqueueOfflineAuthorizationCodeRequest");
    expect(options).not.toHaveProperty("enqueueTaxAuthorityCountOnEnrollment");
    expect(options).not.toHaveProperty("enqueueNumberingReconciliationOnEnrollment");
    expect(enqueueMissingTaxAuthorityCounts).not.toHaveBeenCalled();
    expect(enqueueMissingUnclearOutcomes).not.toHaveBeenCalled();
  });
});

describe("startServer creating Mercado Pago QR orders", () => {
  const credentials = generateArcaTestCredentials();
  const env = {
    DATABASE_URL: "postgres://user:pass@db/purosur",
    RESEND_API_KEY: "re_test_key",
    RECOVERY_EMAIL_FROM: FICTIONAL_RECOVERY_SENDER,
    RECOVERY_EMAIL_REPLY_TO: FICTIONAL_RECOVERY_REPLY_TO,
    BACKOFFICE_ORIGIN: "https://staging.purosur.online",
    EDGE_ORIGIN_SECRET: "edge-secret",
    ARCA_CERTIFICATE: credentials.certificatePem,
    ARCA_ENVIRONMENT: "homologation",
    DEVICE_TOKEN_ROTATION_KEY: ROTATION_KEY,
    INSTALLATION_KEYS_ENCRYPTION_KEY: KEYS_ENCRYPTION_KEY,
  };

  function start(startEnv: Record<string, string>) {
    const backgroundJobs = {
      db: {},
      connections: { withConnection: vi.fn() },
      jobQueue: { enqueueRecoveryRequest: vi.fn() },
      backofficeOrigin: "https://staging.purosur.online",
      worker: { stop: vi.fn() },
      workerUtils: { addJob: vi.fn() },
      close: vi.fn(),
    };
    const buildApp = vi.fn().mockReturnValue(appListeningBy(vi.fn()));
    const setUp = vi.fn().mockResolvedValue(backgroundJobs);
    const started = startServer(startEnv, {
      arcaEndpoints: arcaEndpointsOf,
      initSentry: vi.fn(),
      buildApp,
      setUpBackgroundJobs: setUp,
      recordAuthorizedCuit: vi.fn().mockResolvedValue(undefined),
      enqueueBuyerTaxStatusFetch: vi.fn().mockResolvedValue(undefined),
      enqueueMissingTaxAuthorityCounts: vi.fn().mockResolvedValue(undefined),
      enqueueMissingUnclearOutcomes: vi.fn().mockResolvedValue(undefined),
      enqueueMissingNumberingConflicts: vi.fn().mockResolvedValue(undefined),
      enqueueMissingCreditNotes: vi.fn().mockResolvedValue(undefined),
    });
    return { started, buildApp, backgroundJobs, setUp };
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("gives the app the payment route with a dedicated connection per transaction lane and the Mercado Pago orders when both variables are set", async () => {
    const { started, buildApp, backgroundJobs } = start({
      ...env,
      MERCADOPAGO_ACCESS_TOKEN: "APP_USR-fictional-access-token",
      MERCADOPAGO_WEBHOOK_SECRET: "fictional-webhook-secret",
    });
    await started;

    const [options] = buildApp.mock.calls[0] as [BuildAppOptions];
    const mercadoPago = {
      longestCallMs: expect.any(Number),
      createQrOrder: expect.any(Function),
      createPointOrder: expect.any(Function),
      readOrder: expect.any(Function),
      searchOrdersOfExternalReference: expect.any(Function),
      cancelOrder: expect.any(Function),
      refundOrder: expect.any(Function),
      readOrderRefunds: expect.any(Function),
    };
    expect(options.mercadoPagoOrders).toEqual({
      connections: backgroundJobs.connections,
      mercadoPago,
    });
    expect(options.mercadoPagoNotifications).toEqual({
      db: backgroundJobs.db,
      connections: backgroundJobs.connections,
      mercadoPago,
      webhookSecret: "fictional-webhook-secret",
    });
  });

  it("gives the setup of the background job infrastructure the Mercado Pago orders, so the pending check runs, when all variables are set", async () => {
    const { started, setUp } = start({
      ...env,
      MERCADOPAGO_ACCESS_TOKEN: "APP_USR-fictional-access-token",
      MERCADOPAGO_WEBHOOK_SECRET: "fictional-webhook-secret",
    });
    await started;

    const [backgroundJobsEnv] = setUp.mock.calls[0] as [SetUpBackgroundJobsEnv];
    expect(backgroundJobsEnv.mercadoPago).toEqual({
      longestCallMs: expect.any(Number),
      createQrOrder: expect.any(Function),
      createPointOrder: expect.any(Function),
      readOrder: expect.any(Function),
      searchOrdersOfExternalReference: expect.any(Function),
      cancelOrder: expect.any(Function),
      refundOrder: expect.any(Function),
      readOrderRefunds: expect.any(Function),
    });
  });

  it("gives the setup of the background job infrastructure no Mercado Pago orders when the variables are not set", async () => {
    const { started, setUp } = start(env);
    await started;

    const [backgroundJobsEnv] = setUp.mock.calls[0] as [SetUpBackgroundJobsEnv];
    expect(backgroundJobsEnv).not.toHaveProperty("mercadoPago");
  });

  it("gives the app the payment route without Mercado Pago when neither variable is set", async () => {
    const { started, buildApp, backgroundJobs } = start(env);
    await started;

    const [options] = buildApp.mock.calls[0] as [BuildAppOptions];
    expect(options.mercadoPagoOrders).toEqual({ connections: backgroundJobs.connections });
    expect(options.mercadoPagoNotifications).toEqual({
      db: backgroundJobs.db,
      connections: backgroundJobs.connections,
    });
  });

  it("does not start with only one of the variables, before anything listens", async () => {
    const { started, buildApp } = start({
      ...env,
      MERCADOPAGO_ACCESS_TOKEN: "APP_USR-fictional-access-token",
    });

    await expect(started).rejects.toThrow(
      "MERCADOPAGO_WEBHOOK_SECRET must be set when MERCADOPAGO_ACCESS_TOKEN is set",
    );
    expect(buildApp).not.toHaveBeenCalled();
  });
});

describe("startServer reading supplier price lists", () => {
  const credentials = generateArcaTestCredentials();
  const env = {
    DATABASE_URL: "postgres://user:pass@db/purosur",
    RESEND_API_KEY: "re_test_key",
    RECOVERY_EMAIL_FROM: FICTIONAL_RECOVERY_SENDER,
    RECOVERY_EMAIL_REPLY_TO: FICTIONAL_RECOVERY_REPLY_TO,
    BACKOFFICE_ORIGIN: "https://staging.purosur.online",
    EDGE_ORIGIN_SECRET: "edge-secret",
    ARCA_CERTIFICATE: credentials.certificatePem,
    ARCA_ENVIRONMENT: "homologation",
    DEVICE_TOKEN_ROTATION_KEY: ROTATION_KEY,
    INSTALLATION_KEYS_ENCRYPTION_KEY: KEYS_ENCRYPTION_KEY,
  };
  const priceListsBucket = {
    SUPPLIER_PRICE_LISTS_BUCKET_ENDPOINT: "https://storage.example.com",
    SUPPLIER_PRICE_LISTS_BUCKET_NAME: "supplier-price-lists",
    SUPPLIER_PRICE_LISTS_BUCKET_REGION: "auto",
    SUPPLIER_PRICE_LISTS_BUCKET_ACCESS_KEY_ID: "fictional-key-id",
    SUPPLIER_PRICE_LISTS_BUCKET_SECRET_ACCESS_KEY: "fictional-secret",
  };
  const aiKey = { ANTHROPIC_API_KEY: "fictional-anthropic-key" };

  async function startedWith(startEnv: Record<string, string>) {
    const backgroundJobs = {
      db: {},
      connections: { withConnection: vi.fn() },
      jobQueue: { enqueueRecoveryRequest: vi.fn() },
      backofficeOrigin: "https://staging.purosur.online",
      worker: { stop: vi.fn() },
      workerUtils: { addJob: vi.fn() },
      close: vi.fn(),
    };
    const setUp = vi.fn().mockResolvedValue(backgroundJobs);
    const buildApp = vi.fn().mockReturnValue(appListeningBy(vi.fn()));
    await startServer(startEnv, {
      arcaEndpoints: arcaEndpointsOf,
      initSentry: vi.fn(),
      buildApp,
      setUpBackgroundJobs: setUp,
      recordAuthorizedCuit: vi.fn().mockResolvedValue(undefined),
      enqueueBuyerTaxStatusFetch: vi.fn().mockResolvedValue(undefined),
      enqueueMissingTaxAuthorityCounts: vi.fn().mockResolvedValue(undefined),
      enqueueMissingUnclearOutcomes: vi.fn().mockResolvedValue(undefined),
      enqueueMissingNumberingConflicts: vi.fn().mockResolvedValue(undefined),
      enqueueMissingCreditNotes: vi.fn().mockResolvedValue(undefined),
    });
    const [appOptions] = buildApp.mock.calls[0] as [
      { purchasing?: { supplierPriceListFiles?: unknown } },
    ];
    return { backgroundJobsEnv: setUp.mock.calls[0]?.[0] as SetUpBackgroundJobsEnv, appOptions };
  }

  async function backgroundJobsEnvFor(startEnv: Record<string, string>) {
    return (await startedWith(startEnv)).backgroundJobsEnv;
  }

  it("gives the purchasing routes the same files the reading job reads when the AI key and the bucket are configured", async () => {
    const { backgroundJobsEnv, appOptions } = await startedWith({
      ...env,
      ...aiKey,
      ...priceListsBucket,
    });

    expect(appOptions.purchasing?.supplierPriceListFiles).toBeDefined();
    expect(appOptions.purchasing?.supplierPriceListFiles).toBe(
      backgroundJobsEnv.supplierPriceListReading?.files,
    );
  });

  it("gives the purchasing routes no files without the AI key", async () => {
    const { appOptions } = await startedWith({ ...env, ...priceListsBucket });

    expect(appOptions.purchasing).toBeDefined();
    expect(appOptions.purchasing).not.toHaveProperty("supplierPriceListFiles");
  });

  it("gives the setup of the background job infrastructure the files and the extractor when the AI key and the bucket are configured", async () => {
    const backgroundJobsEnv = await backgroundJobsEnvFor({ ...env, ...aiKey, ...priceListsBucket });

    expect(backgroundJobsEnv.supplierPriceListReading).toEqual({
      files: expect.objectContaining({ store: expect.any(Function), read: expect.any(Function) }),
      extractor: expect.objectContaining({ extract: expect.any(Function) }),
    });
  });

  it("reads no supplier price list without the AI key", async () => {
    const backgroundJobsEnv = await backgroundJobsEnvFor({ ...env, ...priceListsBucket });

    expect(backgroundJobsEnv).not.toHaveProperty("supplierPriceListReading");
  });

  it("reads no supplier price list without the bucket", async () => {
    const backgroundJobsEnv = await backgroundJobsEnvFor({ ...env, ...aiKey });

    expect(backgroundJobsEnv).not.toHaveProperty("supplierPriceListReading");
  });
});

describe("startServer with the real app", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("serves the Users API routes, not the backoffice's index.html, once a database is configured", async () => {
    const staticDir = mkdtempSync(join(tmpdir(), "cloud-static-users-"));
    dirs.push(staticDir);
    writeFileSync(join(staticDir, "index.html"), "<!doctype html>");
    const builtApps: FastifyInstance[] = [];
    const buildAppWithoutListening = (options: BuildAppOptions): FastifyInstance => {
      const app = buildRealApp(options);
      app.listen = async () => "";
      builtApps.push(app);
      return app;
    };
    const setUpBackgroundJobs = vi.fn().mockResolvedValue({
      db: {},
      jobQueue: { enqueueRecoveryRequest: vi.fn() },
      backofficeOrigin: "https://staging.purosur.online",
      worker: { stop: vi.fn() },
      workerUtils: { addJob: vi.fn() },
      close: vi.fn().mockResolvedValue(undefined),
    });

    const app = await startServer(
      {
        DATABASE_URL: "postgres://user:pass@db/purosur",
        RESEND_API_KEY: "re_test_key",
        RECOVERY_EMAIL_FROM: FICTIONAL_RECOVERY_SENDER,
        RECOVERY_EMAIL_REPLY_TO: FICTIONAL_RECOVERY_REPLY_TO,
        BACKOFFICE_ORIGIN: "https://staging.purosur.online",
        EDGE_ORIGIN_SECRET: "edge-secret",
        ARCA_CERTIFICATE: VALID_ARCA_CERTIFICATE,
        ARCA_ENVIRONMENT: "homologation",
        DEVICE_TOKEN_ROTATION_KEY: ROTATION_KEY,
        INSTALLATION_KEYS_ENCRYPTION_KEY: KEYS_ENCRYPTION_KEY,
        BACKOFFICE_STATIC_DIR: staticDir,
      },
      {
        arcaEndpoints: unreachableArcaEndpoints,
        initSentry: vi.fn(),
        buildApp: buildAppWithoutListening,
        setUpBackgroundJobs,
        recordAuthorizedCuit: vi.fn().mockResolvedValue(undefined),
        enqueueMissingTaxAuthorityCounts: vi.fn().mockResolvedValue(undefined),
        enqueueMissingUnclearOutcomes: vi.fn().mockResolvedValue(undefined),
        enqueueMissingNumberingConflicts: vi.fn().mockResolvedValue(undefined),
        enqueueMissingCreditNotes: vi.fn().mockResolvedValue(undefined),
      },
    );

    try {
      const response = await app.inject({
        method: "GET",
        url: "/api/users",
        headers: { "x-edge-origin-secret": "edge-secret" },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ code: "unauthenticated" });
      expect(builtApps).toEqual([app]);
    } finally {
      await app.close();
    }
  });
});

describe("createBackgroundJobQueuePool", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  class FakePool extends EventEmitter {
    readonly end = vi.fn().mockResolvedValue(undefined);
  }

  it("installs a permanent error handler on the pool it owns, so a disconnected idle client never becomes an unhandled error", () => {
    const pool = new FakePool();
    const createPool = vi.fn().mockReturnValue(pool);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    createBackgroundJobQueuePool("postgres://user:pass@db/purosur", { createPool });

    const error = new Error("idle client disconnected");
    expect(createPool).toHaveBeenCalledWith("postgres://user:pass@db/purosur");
    expect(pool.listenerCount("error")).toBeGreaterThan(0);
    expect(() => pool.emit("error", error)).not.toThrow();
    expect(consoleError).toHaveBeenCalledWith(
      "background job queue: idle database client failed",
      error,
    );
  });

  it("installs a connect handler on the pool it owns, so graphile-worker's own assertPool never installs (and later removes) its own", () => {
    const pool = new FakePool();
    const createPool = vi.fn().mockReturnValue(pool);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    createBackgroundJobQueuePool("postgres://user:pass@db/purosur", { createPool });

    expect(pool.listenerCount("connect")).toBeGreaterThan(0);
    const client = new EventEmitter();
    pool.emit("connect", client);
    pool.emit("acquire", client);
    const error = new Error("connection terminated unexpectedly");

    expect(client.listenerCount("error")).toBeGreaterThan(0);
    expect(() => client.emit("error", error)).not.toThrow();
    expect(consoleError).toHaveBeenCalledWith(
      "background job queue: active database client failed",
      error,
    );
  });
});

describe("closeBackgroundJobResources", () => {
  function backgroundJobResources(events: string[]) {
    return {
      worker: {
        stop: vi.fn().mockImplementation(async () => {
          events.push("worker stopped");
        }),
      },
      workerUtils: {
        release: vi.fn().mockImplementation(async () => {
          events.push("utilities released");
        }),
      },
      jobQueuePool: {
        end: vi.fn().mockImplementation(async () => {
          events.push("job-queue pool ended");
        }),
      },
      sql: {
        end: vi.fn().mockImplementation(async () => {
          events.push("database client ended");
        }),
      },
    };
  }

  it("releases the job-queue utilities before ending the pool they use, the worker first and the database client last", async () => {
    const events: string[] = [];

    await closeBackgroundJobResources(backgroundJobResources(events));

    expect(events).toEqual([
      "worker stopped",
      "utilities released",
      "job-queue pool ended",
      "database client ended",
    ]);
  });

  it("still closes every later resource when two of them fail, then rejects with both failures", async () => {
    const events: string[] = [];
    const resources = backgroundJobResources(events);
    resources.worker.stop.mockRejectedValue(new Error("worker stop failed"));
    resources.jobQueuePool.end.mockImplementation(async () => {
      events.push("job-queue pool ended");
      throw new Error("pool end failed");
    });

    const failure = await closeBackgroundJobResources(resources).then(
      () => undefined,
      (error: unknown) => error,
    );

    expect(events).toEqual(["utilities released", "job-queue pool ended", "database client ended"]);
    expect(failure).toBeInstanceOf(AggregateError);
    expect((failure as AggregateError).errors.map((error: Error) => error.message)).toEqual([
      expect.stringContaining("background job runner failed to shut down: worker stop failed"),
      expect.stringContaining("job-queue pool failed to shut down: pool end failed"),
    ]);
  });
});

describe("shutdownServer", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("closes the app, then flushes Sentry, then exits 0", async () => {
    const calls: string[] = [];
    const close = vi.fn(async () => {
      calls.push("close");
    });
    const flush = vi.fn(async (_timeoutMs: number) => {
      calls.push("flush");
      return true;
    });
    const exit = vi.fn((code: number) => {
      calls.push(`exit ${code}`);
    });

    await shutdownServer({ close }, { flush, exit });

    expect(calls).toEqual(["close", "flush", "exit 0"]);
    expect(flush).toHaveBeenCalledWith(expect.any(Number));
  });

  it("still flushes Sentry and exits 1 when closing the app fails", async () => {
    const close = vi.fn().mockRejectedValue(new Error("close failed"));
    const flush = vi.fn().mockResolvedValue(true);
    const exit = vi.fn();
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await shutdownServer({ close }, { flush, exit });

    expect(flush).toHaveBeenCalled();
    expect(exit).toHaveBeenCalledWith(1);
  });
});

describe("registerShutdownHandlers", () => {
  it("shuts the server down once on SIGTERM or SIGINT, even when both arrive", async () => {
    const listeners = new Map<string, () => void>();
    const signals = {
      once: vi.fn((signal: string, listener: () => void) => {
        listeners.set(signal, listener);
      }),
    };
    const close = vi.fn().mockResolvedValue(undefined);
    const flush = vi.fn().mockResolvedValue(true);
    const exit = vi.fn();

    registerShutdownHandlers({ close }, { signals, flush, exit });

    expect([...listeners.keys()].sort()).toEqual(["SIGINT", "SIGTERM"]);
    listeners.get("SIGTERM")?.();
    listeners.get("SIGINT")?.();
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0));
    expect(close).toHaveBeenCalledTimes(1);
  });
});

describe("reportStartupFailure", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("captures the error, flushes Sentry, then exits 1", async () => {
    const calls: string[] = [];
    const error = new Error("listen EADDRINUSE");
    const captureException = vi.fn((captured: unknown) => {
      calls.push(`capture ${(captured as Error).message}`);
    });
    const flush = vi.fn(async (_timeoutMs: number) => {
      calls.push("flush");
      return true;
    });
    const exit = vi.fn((code: number) => {
      calls.push(`exit ${code}`);
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await reportStartupFailure(error, { captureException, flush, exit });

    expect(calls).toEqual(["capture listen EADDRINUSE", "flush", "exit 1"]);
  });
});

describe("startServer ARCA endpoints", () => {
  it("cannot be started without being handed the ARCA endpoints", () => {
    expectTypeOf<undefined>().not.toExtend<Parameters<typeof startServer>[1]>();
    expectTypeOf<Omit<StartServerDeps, "arcaEndpoints">>().not.toExtend<StartServerDeps>();
  });

  const credentials = generateArcaTestCredentials();
  const endpoints = {
    wsfe: "http://127.0.0.1:1/wsfe-for-this-test",
    wsaa: "http://127.0.0.1:1/wsaa-for-this-test",
  };

  it("hands setUpBackgroundJobs the endpoints it was given instead of ARCA's own", async () => {
    const fakeApp = appListeningBy(vi.fn().mockResolvedValue(undefined));
    const setUpBackgroundJobs = vi.fn().mockResolvedValue({
      db: {},
      jobQueue: { enqueueRecoveryRequest: vi.fn() },
      backofficeOrigin: "https://staging.purosur.online",
      worker: { stop: vi.fn() },
      workerUtils: { addJob: vi.fn() },
      close: vi.fn(),
    });
    const arcaEndpoints = vi.fn().mockReturnValue(endpoints);

    await startServer(
      {
        DATABASE_URL: "postgres://user:pass@db/purosur",
        RESEND_API_KEY: "re_test_key",
        RECOVERY_EMAIL_FROM: FICTIONAL_RECOVERY_SENDER,
        RECOVERY_EMAIL_REPLY_TO: FICTIONAL_RECOVERY_REPLY_TO,
        BACKOFFICE_ORIGIN: "https://staging.purosur.online",
        EDGE_ORIGIN_SECRET: "edge-secret",
        ARCA_CERTIFICATE: credentials.certificatePem,
        ARCA_ENVIRONMENT: "homologation",
        ARCA_PRIVATE_KEY: credentials.privateKeyPem,
        DEVICE_TOKEN_ROTATION_KEY: ROTATION_KEY,
        INSTALLATION_KEYS_ENCRYPTION_KEY: KEYS_ENCRYPTION_KEY,
      },
      {
        initSentry: vi.fn(),
        buildApp: vi.fn().mockReturnValue(fakeApp),
        setUpBackgroundJobs,
        recordAuthorizedCuit: vi.fn().mockResolvedValue(undefined),
        enqueueMissingTaxAuthorityCounts: vi.fn().mockResolvedValue(undefined),
        enqueueMissingUnclearOutcomes: vi.fn().mockResolvedValue(undefined),
        enqueueMissingNumberingConflicts: vi.fn().mockResolvedValue(undefined),
        enqueueMissingCreditNotes: vi.fn().mockResolvedValue(undefined),
        arcaEndpoints,
      },
    );

    expect(arcaEndpoints).toHaveBeenCalledWith("homologation");
    expect(setUpBackgroundJobs).toHaveBeenCalledWith(
      expect.objectContaining({
        arcaVitality: { endpoint: endpoints.wsfe },
        arcaWsaa: expect.objectContaining({ endpoint: endpoints.wsaa }),
      }),
      expect.any(Function),
    );
  });
});
