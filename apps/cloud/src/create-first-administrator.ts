import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { describeDatabaseFailure } from "./db/describe-database-failure.js";
import {
  createFirstAdministrator,
  FirstAdministratorAlreadyBootstrappedError,
  InvalidFirstAdministratorInputError,
} from "./users/create-first-administrator.js";

export interface ParsedCreateFirstAdministratorArgs {
  name: string;
  email: string;
}

export class UsageError extends Error {}

const USAGE = "usage: create-first-administrator --name <name> --email <email>";

export function parseCreateFirstAdministratorArgs(
  argv: string[],
): ParsedCreateFirstAdministratorArgs {
  let values: { name?: string; email?: string };
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        name: { type: "string" },
        email: { type: "string" },
      },
      strict: true,
      allowPositionals: false,
    }));
  } catch (error) {
    throw new UsageError(error instanceof Error ? `${USAGE} (${error.message})` : USAGE);
  }
  if (!values.name || !values.email) {
    throw new UsageError(USAGE);
  }
  return { name: values.name, email: values.email };
}

/** Runs the use case against a real database connection, closing it whether it succeeds or fails. */
export async function runCreateFirstAdministrator(
  databaseUrl: string,
  input: ParsedCreateFirstAdministratorArgs,
): Promise<{ email: string }> {
  const sql = postgres(databaseUrl, { max: 1, connect_timeout: 10 });
  try {
    const result = await createFirstAdministrator(drizzle(sql), input);
    return { email: result.email };
  } finally {
    await sql.end({ timeout: 1 });
  }
}

function describeCreateFirstAdministratorFailure(error: unknown): string {
  if (
    error instanceof FirstAdministratorAlreadyBootstrappedError ||
    error instanceof InvalidFirstAdministratorInputError
  ) {
    return error.message;
  }
  return describeDatabaseFailure(error);
}

function parseArgsOrExit(argv: string[]): ParsedCreateFirstAdministratorArgs {
  try {
    return parseCreateFirstAdministratorArgs(argv);
  } catch (error) {
    console.error(
      `create-first-administrator: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }
}

const isMainModule =
  process.argv[1] !== undefined && process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  const parsedArgs = parseArgsOrExit(process.argv.slice(2));
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("create-first-administrator: DATABASE_URL is not set");
    process.exit(1);
  } else {
    runCreateFirstAdministrator(databaseUrl, parsedArgs)
      .then((result) => {
        console.log(`create-first-administrator: created Administrator ${result.email}`);
      })
      .catch((error: unknown) => {
        console.error(
          `create-first-administrator: ${describeCreateFirstAdministratorFailure(error)}`,
        );
        process.exit(1);
      });
  }
}
