import type {
  AccountProfile,
  Accounts,
  StoredSignInPasskey,
} from "@purosur/domain/access/use-cases";
import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { passkeys, users } from "../platform/db/schema.js";

class DrizzleAccounts<TQueryResult extends PgQueryResultHKT> implements Accounts {
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async profile(userId: string): Promise<AccountProfile | undefined> {
    const [account] = await this.db
      .select({ firstName: users.firstName, email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return account;
  }

  async signInPasskey(credentialId: string): Promise<StoredSignInPasskey | undefined> {
    const [passkey] = await this.db
      .select({
        id: passkeys.id,
        userId: passkeys.userId,
        credentialId: passkeys.credentialId,
        publicKey: passkeys.publicKey,
        counter: passkeys.counter,
        transports: passkeys.transports,
        userActive: users.active,
      })
      .from(passkeys)
      .innerJoin(users, eq(users.id, passkeys.userId))
      .where(eq(passkeys.credentialId, credentialId))
      .limit(1);
    return passkey;
  }
}

export function drizzleAccounts<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
): Accounts {
  return new DrizzleAccounts(db);
}
