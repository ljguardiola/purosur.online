import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { describeDatabaseFailure } from "./db/describe-database-failure.js";
import { type ClearSampleDataOutcome, clearSampleData } from "./sample-data/clear-sample-data.js";
import { resolveSampleDataTarget } from "./sample-data/target-guard.js";

export async function runClearSampleData(databaseUrl: string): Promise<ClearSampleDataOutcome> {
  const sql = postgres(databaseUrl, { max: 1, connect_timeout: 10 });
  try {
    return await clearSampleData(drizzle(sql));
  } finally {
    await sql.end({ timeout: 1 });
  }
}

export function describeClearSampleDataOutcome(outcome: ClearSampleDataOutcome): string {
  switch (outcome.kind) {
    case "not_loaded":
      return "no sample data is loaded; nothing to do";
    case "refused":
      return `refused: ${outcome.detail}; nothing was cleared`;
    case "cleared":
      return (
        `cleared ${outcome.summary.categories} categories, ${outcome.summary.products} products, ` +
        `${outcome.summary.roles} roles, ${outcome.summary.users} users, ${outcome.summary.registers} registers ` +
        `and ${outcome.summary.alerts} alerts`
      );
    default:
      return outcome satisfies never;
  }
}

function isMainModule(): boolean {
  return process.argv[1] !== undefined && process.argv[1] === fileURLToPath(import.meta.url);
}

if (isMainModule()) {
  const databaseUrl = process.env.DATABASE_URL;
  const target = resolveSampleDataTarget({
    databaseUrl,
    railwayEnvironmentName: process.env.RAILWAY_ENVIRONMENT_NAME,
  });

  if (target !== "local") {
    console.error(
      "clear-sample-data: refused (this only runs locally; on staging the cloud connects as " +
        "cloud_app, which cannot delete prices, price reviews, audit rows or products)",
    );
    process.exit(1);
  } else if (!databaseUrl) {
    console.error("clear-sample-data: DATABASE_URL is not set");
    process.exit(1);
  } else {
    runClearSampleData(databaseUrl)
      .then((outcome) => {
        console.log(`clear-sample-data: ${describeClearSampleDataOutcome(outcome)}`);
        if (outcome.kind === "refused") {
          process.exit(1);
        }
      })
      .catch((error: unknown) => {
        console.error(`clear-sample-data: ${describeDatabaseFailure(error)}`);
        process.exit(1);
      });
  }
}
