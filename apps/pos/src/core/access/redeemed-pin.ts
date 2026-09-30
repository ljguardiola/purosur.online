import type { PinCodeRedemption } from "@purosur/contracts";
import type { LocalDatabase } from "../platform/local-database";
import { derivePinVerifier } from "./pin-verifier";

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
    database
      .prepare(
        `INSERT INTO pin_verifiers (user_id, verifier) VALUES (@user_id, @verifier)
         ON CONFLICT (user_id) DO UPDATE SET verifier = excluded.verifier`,
      )
      .run({ user_id, verifier: derivePinVerifier(pepper, pin_hash) });
  })();
}
