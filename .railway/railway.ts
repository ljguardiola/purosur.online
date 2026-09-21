// Secrets are read from the environment of whoever runs `railway config plan`/`apply`; the CLI
// evaluates this file as ordinary Node, so `process.env` reaches the compiled graph.
//
// Railway IaC cannot declare a generated `*.up.railway.app` domain (`domains` is for custom
// domains only); the deploy workflow ensures one exists after every apply.
//
// `bucket()` exposes no `.env` accessor in this SDK version, so the bucket's credentials cannot be
// referenced from the cloud service here.
import { bucket, defineRailway, image, postgres, project, service } from "railway/iac";

// Bucket regions and service/database regions are different code sets: "iad" is valid only for a
// bucket, and a database given "iad" is placed in "us-east4-eqdc4a".
const SERVICE_REGION = "us-east4-eqdc4a";
const BUCKET_REGION = "iad";

// Railway IaC cannot register a custom domain: it must be added once in the dashboard or with
// `railway domain <domain> --service cloud`, and only then declared here.
const CUSTOM_DOMAINS: Record<string, string[]> = {
  staging: ["staging.purosur.online"],
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`.railway/railway.ts: missing required environment variable ${name}`);
  }
  return value;
}

export default defineRailway((ctx) => {
  // An image digest reference (ghcr.io/ljguardiola/purosur-cloud@sha256:...), never a moving tag.
  const imageRef = requireEnv("CLOUD_IMAGE_REF");
  const ghcrPullToken = requireEnv("GHCR_PULL_TOKEN");
  const sentryDsn = requireEnv("CLOUD_SENTRY_DSN");
  const environment = ctx.environment;
  if (!environment) {
    throw new Error(".railway/railway.ts: the CLI gave no target environment name");
  }

  const db = postgres("postgres", { region: SERVICE_REGION });
  const media = bucket("media", { region: BUCKET_REGION });

  const cloud = service("cloud", {
    source: image(imageRef, { autoUpdates: { type: "disabled" } }),
    regions: { [SERVICE_REGION]: 1 },
    domains: CUSTOM_DOMAINS[environment] ?? [],
    deploy: {
      registryCredentials: {
        username: "ljguardiola",
        password: ghcrPullToken,
      },
      // A failing pre-deploy command is not retried and stops the deployment, so the previous one
      // keeps serving. Railway accepts a single command string here (at most one array item), and
      // only `apply` rejects more, not `plan`.
      preDeployCommand: ["node dist/migrate.js"],
      healthcheckPath: "/health",
    },
    env: {
      DATABASE_URL: db.env.DATABASE_URL,
      SENTRY_DSN: sentryDsn,
      SENTRY_ENVIRONMENT: environment,
    },
  });

  return project("Puro Sur", {
    resources: [db, media, cloud],
  });
});
