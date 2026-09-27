import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { describeDatabaseFailure } from "./platform/db/describe-database-failure.js";
import { type LoadSampleDataOutcome, loadSampleData } from "./sample-data/load-sample-data.js";
import { resolveSampleDataTarget } from "./sample-data/target-guard.js";

export async function runLoadSampleData(databaseUrl: string): Promise<LoadSampleDataOutcome> {
  const sql = postgres(databaseUrl, { max: 1, connect_timeout: 10 });
  try {
    return await loadSampleData(drizzle(sql), { now: () => new Date() });
  } finally {
    await sql.end({ timeout: 1 });
  }
}

export function describeLoadSampleDataOutcome(outcome: LoadSampleDataOutcome): string {
  switch (outcome.kind) {
    case "already_loaded":
      return "sample data is already loaded; nothing to do";
    case "no_administrator":
      return "refused: no active Administrator exists yet (run create-first-administrator first)";
    case "collision":
      return `refused: ${outcome.detail}`;
    case "loaded":
      return (
        `loaded ${outcome.summary.categories} categories, ${outcome.summary.products} products, ` +
        `${outcome.summary.roles} roles, ${outcome.summary.users} users and ${outcome.summary.registers} registers`
      );
    default:
      return outcome satisfies never;
  }
}

function isMainModule(): boolean {
  return process.argv[1] !== undefined && process.argv[1] === fileURLToPath(import.meta.url);
}

if (isMainModule()) {
  const databaseUrl = process.env["DATABASE_URL"];
  const target = resolveSampleDataTarget({
    databaseUrl,
    railwayEnvironmentName: process.env["RAILWAY_ENVIRONMENT_NAME"],
  });

  if (target === "refused") {
    console.error(
      "load-sample-data: refused (this only runs locally or on staging, never against production or an unrecognized target)",
    );
    process.exit(1);
  } else if (!databaseUrl) {
    console.error("load-sample-data: DATABASE_URL is not set");
    process.exit(1);
  } else {
    runLoadSampleData(databaseUrl)
      .then((outcome) => {
        console.log(`load-sample-data: ${describeLoadSampleDataOutcome(outcome)}`);
        if (outcome.kind === "collision" || outcome.kind === "no_administrator") {
          process.exit(1);
        }
      })
      .catch((error: unknown) => {
        console.error(`load-sample-data: ${describeDatabaseFailure(error)}`);
        process.exit(1);
      });
  }
}
