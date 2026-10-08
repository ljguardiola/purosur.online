import type { PinCodeRedemption } from "@purosur/contracts";
import { replacePin } from "@purosur/domain/credentials/use-cases";
import { derivePinVerifier } from "../access/pin-verifier";
import { SqliteSignInStore } from "../access/sqlite-sign-in-store";
import type { LocalDatabase } from "../platform/local-database";

// The user's version is left as pulled: the next pull of that user brings the version the
// redemption bumped, with this same hash, and derives this same verifier again.
export function applyRedeemedPin(
  database: LocalDatabase,
  pepper: string,
  { user_id, salt, pin_hash }: PinCodeRedemption,
): void {
  database.transaction(() => {
    const saved = database
      .prepare("UPDATE users SET salt = @salt WHERE id = @id AND removed = 0")
      .run({ id: user_id, salt });
    if (saved.changes === 0) {
      return;
    }
    const store = new SqliteSignInStore(database);
    replacePin({ store }, { userId: user_id, credential: derivePinVerifier(pepper, pin_hash) });
    store.remember(user_id);
  })();
}
