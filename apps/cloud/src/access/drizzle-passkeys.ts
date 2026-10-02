import type {
  PasskeySummary,
  Passkeys,
  RegisteredCredential,
  SignInPasskey,
} from "@purosur/domain/access/use-cases";
import { and, asc, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { passkeys } from "../platform/db/schema.js";

class DrizzlePasskeys<TQueryResult extends PgQueryResultHKT> implements Passkeys {
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  passkeySummaries(userId: string): Promise<PasskeySummary[]> {
    return this.db
      .select({
        id: passkeys.id,
        name: passkeys.name,
        createdAt: passkeys.createdAt,
        lastUsedAt: passkeys.lastUsedAt,
      })
      .from(passkeys)
      .where(eq(passkeys.userId, userId))
      .orderBy(asc(passkeys.createdAt));
  }

  registeredCredentials(userId: string): Promise<RegisteredCredential[]> {
    return this.db
      .select({ credentialId: passkeys.credentialId, transports: passkeys.transports })
      .from(passkeys)
      .where(eq(passkeys.userId, userId));
  }

  async passkeyByCredentialId(
    userId: string,
    credentialId: string,
  ): Promise<SignInPasskey | undefined> {
    const [passkey] = await this.db
      .select({
        id: passkeys.id,
        userId: passkeys.userId,
        credentialId: passkeys.credentialId,
        publicKey: passkeys.publicKey,
        counter: passkeys.counter,
        transports: passkeys.transports,
      })
      .from(passkeys)
      .where(and(eq(passkeys.credentialId, credentialId), eq(passkeys.userId, userId)))
      .limit(1);
    return passkey;
  }
}

export function drizzlePasskeys<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
): Passkeys {
  return new DrizzlePasskeys(db);
}
