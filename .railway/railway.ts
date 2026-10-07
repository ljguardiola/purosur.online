// Secrets are read from the environment of whoever runs `railway config plan`/`apply`; the CLI
// evaluates this file as ordinary Node, so `process.env` reaches the compiled graph.
//
// `bucket()` exposes no `.env` accessor in this SDK version, so the bucket's credentials cannot be
// referenced from the cloud service here.
import { bucket, defineRailway, image, postgres, project, service } from "railway/iac";
// Railway IaC cannot register a custom domain: it must be added once in the dashboard or with
// `railway domain <domain> --service "Cloud Server"`, and only then declared in this file.
// .github/scripts/apply-edge-rules.mjs reads the same file to scope the edge origin secret.
import customDomains from "./custom-domains.json" with { type: "json" };

// Bucket regions and service/database regions are different code sets: "iad" is valid only for a
// bucket, and a database given "iad" is placed in "us-east4-eqdc4a".
const SERVICE_REGION = "us-east4-eqdc4a";
const BUCKET_REGION = "iad";

const CUSTOM_DOMAINS: Record<string, string[]> = customDomains;

// The recovery-request email's sender is per environment, but its reply-to address is the same
// across every environment, so it is a plain constant rather than a per-environment map.
const RECOVERY_EMAIL_FROM: Record<string, string> = {
  staging: "Puro Sur <acceso@mail.staging.purosur.online>",
};
const RECOVERY_EMAIL_REPLY_TO = "purosur.comarca@gmail.com";

// Staging talks to ARCA's homologation (test) services; only the production environment talks to
// ARCA's real ones.
const ARCA_ENVIRONMENTS: Record<string, string> = {
  staging: "homologation",
  production: "production",
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`.railway/railway.ts: missing required environment variable ${name}`);
  }
  return value;
}

function requireArcaEnvironment(environment: string): string {
  const arcaEnvironment = ARCA_ENVIRONMENTS[environment];
  if (!arcaEnvironment) {
    throw new Error(`.railway/railway.ts: no ARCA environment configured for ${environment}`);
  }
  return arcaEnvironment;
}

function requireBackofficeOrigin(environment: string): string {
  const [domain] = CUSTOM_DOMAINS[environment] ?? [];
  if (!domain) {
    throw new Error(`.railway/railway.ts: no backoffice domain configured for ${environment}`);
  }
  return `https://${domain}`;
}

function requireRecoveryEmailFrom(environment: string): string {
  const from = RECOVERY_EMAIL_FROM[environment];
  if (!from) {
    throw new Error(`.railway/railway.ts: no recovery email sender configured for ${environment}`);
  }
  return from;
}

const POSTGRES_RESOURCE_NAME = "Database";
const CLOUD_APP_ROLE = "cloud_app";

// `db.env.DATABASE_URL` is a reference object, not a string (it has no `toString`, so
// interpolating it into a template literal yields "[object Object]"), and it always resolves to
// the admin credential anyway. `cloud_app`'s own connection string is instead built as a plain
// literal that embeds Railway's own `${{<resource>.<field>}}` reference syntax as literal text,
// which the CLI resolves against the named resource only when it applies the config.
function cloudAppDatabaseUrl(cloudAppPassword: string): string {
  return (
    `postgresql://${CLOUD_APP_ROLE}:` +
    encodeURIComponent(cloudAppPassword) +
    `@\${{${POSTGRES_RESOURCE_NAME}.PGHOST}}` +
    `:\${{${POSTGRES_RESOURCE_NAME}.PGPORT}}` +
    `/\${{${POSTGRES_RESOURCE_NAME}.PGDATABASE}}`
  );
}

export default defineRailway((ctx) => {
  // An image digest reference (ghcr.io/ljguardiola/purosur-cloud@sha256:...), never a moving tag.
  const imageRef = requireEnv("CLOUD_IMAGE_REF");
  const ghcrPullToken = requireEnv("GHCR_PULL_TOKEN");
  const sentryDsn = requireEnv("CLOUD_SENTRY_DSN");
  const backofficeSentryDsn = requireEnv("BACKOFFICE_SENTRY_DSN");
  const resendApiKey = requireEnv("RESEND_API_KEY");
  const edgeOriginSecret = requireEnv("EDGE_ORIGIN_SECRET");
  const deviceTokenRotationKey = requireEnv("DEVICE_TOKEN_ROTATION_KEY");
  const installationKeysEncryptionKey = requireEnv("INSTALLATION_KEYS_ENCRYPTION_KEY");
  const cloudAppDatabasePassword = requireEnv("CLOUD_APP_DATABASE_PASSWORD");
  // A secret although a certificate is public: its subject carries the business's real CUIT, which
  // stays out of this public repository and its logs.
  const arcaCertificate = requireEnv("ARCA_CERTIFICATE");
  // The secret key matching `ARCA_CERTIFICATE`, with which the cloud signs its logins at ARCA.
  const arcaPrivateKey = requireEnv("ARCA_PRIVATE_KEY");
  const environment = ctx.environment;
  if (!environment) {
    throw new Error(".railway/railway.ts: the CLI gave no target environment name");
  }
  const arcaEnvironment = requireArcaEnvironment(environment);
  const backofficeOrigin = requireBackofficeOrigin(environment);

  // Railway identifies each resource by its name: renaming one only here deletes it and creates an
  // empty one in its place, database included. Rename it in the Railway dashboard first.
  const db = postgres(POSTGRES_RESOURCE_NAME, { region: SERVICE_REGION });
  const media = bucket("Media Storage", { region: BUCKET_REGION });

  const registryCredentials = {
    username: "ljguardiola",
    password: ghcrPullToken,
  };
  const cloudImage = image(imageRef, { autoUpdates: { type: "disabled" } });

  // The only resource ever given the Postgres admin credential (`db.env.DATABASE_URL`): it runs
  // the schema migrations once per deploy, as the role that owns the schema, then exits.
  // `restartPolicyType: "NEVER"` keeps a finished or crashed run from restarting instead of the
  // deploy just failing. It never takes traffic, so it has no domain and no healthcheck.
  const migrate = service("Schema Migrations", {
    source: cloudImage,
    regions: { [SERVICE_REGION]: 1 },
    deploy: {
      registryCredentials,
      startCommand: "node dist/migrate.js",
      restartPolicyType: "NEVER",
    },
    env: {
      DATABASE_URL: db.env.DATABASE_URL,
      CLOUD_APP_DATABASE_PASSWORD: cloudAppDatabasePassword,
    },
  });

  const cloud = service("Cloud Server", {
    source: cloudImage,
    regions: { [SERVICE_REGION]: 1 },
    domains: CUSTOM_DOMAINS[environment] ?? [],
    deploy: {
      registryCredentials,
      // Read-only: waits, connected as `cloud_app`, until the schema that `Schema Migrations`
      // applied matches this image's bundled migrations, instead of applying any schema change
      // itself. Railway
      // accepts a single command string here (at most one array item), and only `apply` rejects
      // more, not `plan`.
      preDeployCommand: ["node dist/wait-for-ready.js"],
      healthcheckPath: "/api/health",
    },
    env: {
      DATABASE_URL: cloudAppDatabaseUrl(cloudAppDatabasePassword),
      SENTRY_DSN: sentryDsn,
      SENTRY_ENVIRONMENT: environment,
      BACKOFFICE_SENTRY_DSN: backofficeSentryDsn,
      RESEND_API_KEY: resendApiKey,
      RECOVERY_EMAIL_FROM: requireRecoveryEmailFrom(environment),
      RECOVERY_EMAIL_REPLY_TO,
      BACKOFFICE_ORIGIN: backofficeOrigin,
      EDGE_ORIGIN_SECRET: edgeOriginSecret,
      DEVICE_TOKEN_ROTATION_KEY: deviceTokenRotationKey,
      INSTALLATION_KEYS_ENCRYPTION_KEY: installationKeysEncryptionKey,
      ARCA_CERTIFICATE: arcaCertificate,
      ARCA_PRIVATE_KEY: arcaPrivateKey,
      ARCA_ENVIRONMENT: arcaEnvironment,
    },
  });

  return project("Puro Sur", {
    resources: [db, media, migrate, cloud],
  });
});
