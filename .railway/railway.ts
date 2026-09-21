// Railway Infrastructure as Code for the "Puro Sur" project (#92). Declares the cloud service's
// staging shape: a pre-built GHCR image with automatic updates disabled (the pipeline in
// .github/workflows/deploy-cloud-staging.yml is the only thing that ever moves this service to a
// newer image), Postgres, and an object storage bucket.
//
// Every value that would otherwise commit a secret is read from the environment that invokes
// `railway config plan`/`apply` instead - CI passes them as job env vars (see the deploy
// workflow); a local `railway config plan` needs the same variables exported first. Confirmed by
// a real read-only `railway config plan --show-values --json` run against the linked staging
// project: a value read from `process.env` inside this file reaches the compiled graph, so the
// CLI's evaluator runs this file as ordinary Node, not a sandboxed subset.
//
// Not declared here: Railway's IaC reference states a generated `*.up.railway.app` service domain
// is "not included in .railway/railway.ts" - it has no DSL field. `.github/workflows/deploy-
// cloud-staging.yml` ensures one exists after every apply instead (list, create only if missing).
// `domains` in this SDK is for custom domains only.
//
// Open item: `bucket()` returns a plain BucketNode with no `.env` accessor (only
// postgres()/redis()/mysql()/mongo() are "Referencable"), so this SDK version has no typed way to
// wire the bucket's credentials into the cloud service. Nothing in apps/cloud reads the bucket
// yet, so the bucket is provisioned without service credentials for now.
//
// `config apply` is not atomic: a sandbox run that ended `"status":"failed"` with an empty change
// set had still created the postgres service before failing on something else. A retried apply
// converges on the declared state regardless - it never needs the previous attempt rolled back by
// hand.
import { bucket, defineRailway, image, postgres, project, service } from "railway/iac";

// "iad" is a bucket region code only. Services and databases place by Railway's deployment region
// IDs instead, a different code set - verified live: a postgres created with region "iad" landed
// in "us-east4-eqdc4a" (US East), and every later plan wanted to destructively "Move database
// postgres to iad" until the database and the service were both pinned to that same deployment
// region id.
const SERVICE_REGION = "us-east4-eqdc4a";
const BUCKET_REGION = "iad";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`.railway/railway.ts: missing required environment variable ${name}`);
  }
  return value;
}

export default defineRailway((ctx) => {
  // The exact digest CI just built and pushed (ghcr.io/ljguardiola/purosur-cloud@sha256:...),
  // never a moving tag.
  const imageRef = requireEnv("CLOUD_IMAGE_REF");
  // A classic PAT on the owner's personal GitHub account, scoped to read:packages (deviation from
  // the design's machine account, recorded in the PR: the machine account stays pending).
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
    deploy: {
      registryCredentials: {
        username: "ljguardiola",
        password: ghcrPullToken,
      },
      // Railway docs: "If your command fails, it will not be retried and the deployment will not
      // proceed" - the previous deployment keeps serving traffic. The array holds at most one
      // item: Railway rejects more ("Too big: expected array to have <=1 items"), verified live -
      // `railway config plan` did not catch this locally, only a real `apply` did.
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
