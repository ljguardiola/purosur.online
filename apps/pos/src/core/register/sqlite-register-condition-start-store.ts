import type { ZoneRulesSource } from "@purosur/domain";
import type {
  RegisterConditionStartStore,
  RegisterConditionStartStoreTransaction,
} from "@purosur/domain/register/use-cases";
import { inArgentinaTime } from "../platform/argentina-time";
import type { LocalDatabase } from "../platform/local-database";

interface StartRow {
  condition: string;
  since: string;
}

export class SqliteRegisterConditionStartStore implements RegisterConditionStartStore {
  private readonly database: LocalDatabase;
  private readonly zoneRules: ZoneRulesSource;

  constructor(database: LocalDatabase, zoneRules: ZoneRulesSource) {
    this.database = database;
    this.zoneRules = zoneRules;
  }

  transaction<TOutcome>(work: (tx: RegisterConditionStartStoreTransaction) => TOutcome): TOutcome {
    return this.database.transaction(() => work(this.transactionScope()))();
  }

  private transactionScope(): RegisterConditionStartStoreTransaction {
    return {
      lockConditionStarts: () =>
        new Map(
          this.database
            .prepare<[], StartRow>("SELECT condition, since FROM register_condition_starts")
            .all()
            .map((row) => [row.condition, new Date(row.since)]),
        ),
      replaceConditionStarts: (starts) => {
        this.database.prepare("DELETE FROM register_condition_starts").run();
        const insert = this.database.prepare<[string, string]>(
          "INSERT INTO register_condition_starts (condition, since) VALUES (?, ?)",
        );
        const rules = this.zoneRules.zoneRules();
        for (const [condition, since] of starts) {
          insert.run(condition, inArgentinaTime(since, rules));
        }
      },
    };
  }
}
