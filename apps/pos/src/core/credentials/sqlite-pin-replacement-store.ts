import type { PinReplacementStore } from "@purosur/domain/credentials/use-cases";
import type { LocalDatabase } from "../platform/local-database";

export class SqlitePinReplacementStore implements PinReplacementStore<string> {
  private readonly database: LocalDatabase;

  constructor(database: LocalDatabase) {
    this.database = database;
  }

  clearPinSignInFailures(userId: string): void {
    this.database.prepare("DELETE FROM pin_sign_in_failures WHERE user_id = ?").run(userId);
  }

  savePinCredential(userId: string, verifier: string | undefined): boolean {
    const current = this.database
      .prepare<[string], { verifier: string }>(
        "SELECT verifier FROM pin_verifiers WHERE user_id = ?",
      )
      .get(userId)?.verifier;
    if (verifier === undefined) {
      this.database.prepare("DELETE FROM pin_verifiers WHERE user_id = ?").run(userId);
    } else {
      this.database
        .prepare(
          `INSERT INTO pin_verifiers (user_id, verifier) VALUES (@user_id, @verifier)
           ON CONFLICT (user_id) DO UPDATE SET verifier = excluded.verifier`,
        )
        .run({ user_id: userId, verifier });
    }
    return current !== verifier;
  }
}
