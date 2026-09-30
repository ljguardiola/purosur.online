import type { OpenCashSession, OpenCashSessionOutcome } from "@purosur/contracts";
import { type Clock, type IdGenerator, openCashSession } from "@purosur/domain/register/use-cases";
import { grantedPermissionKeys } from "../access/granted-permission-keys";
import { SqliteSignInStore } from "../access/sqlite-sign-in-store";
import type { LocalDatabase } from "../platform/local-database";
import { readOpenSession, SqliteCashLedger } from "./sqlite-cash-ledger";

export interface CashSessionRequestDeps {
  database: LocalDatabase;
  readOutboxChainKey: () => Promise<string | undefined>;
  now: Clock["now"];
  ids: IdGenerator;
}

export async function openCashSessionFor(
  { database, readOutboxChainKey, now, ids }: CashSessionRequestDeps,
  userId: string,
  openingFloat: number,
): Promise<OpenCashSessionOutcome> {
  const outboxChainKey = await readOutboxChainKey();
  if (outboxChainKey === undefined) {
    return { kind: "unavailable" };
  }
  const outcome = openCashSession(
    {
      ledger: new SqliteCashLedger(database, new SqliteSignInStore(database), outboxChainKey),
      clock: { now },
      ids,
    },
    { openerId: userId, openingFloat },
  );
  return outcome.kind === "opened"
    ? {
        kind: "opened",
        session: {
          id: outcome.session.id,
          opened_at: outcome.session.openedAt.toISOString(),
          opening_float: outcome.session.openingFloat,
        },
      }
    : { kind: outcome.kind };
}

export function currentCashSession(database: LocalDatabase): OpenCashSession | null {
  const session = readOpenSession(database);
  if (session === undefined) {
    return null;
  }
  const opener = new SqliteSignInStore(database).anyPerson(session.openedBy) ?? {
    firstName: "",
    access: { isAdministrator: false, permissionKeys: [] },
  };
  return {
    id: session.id,
    opened_at: session.openedAt.toISOString(),
    opened_by: {
      user_id: session.openedBy,
      first_name: opener.firstName,
      permission_keys: grantedPermissionKeys(opener.access),
    },
  };
}
