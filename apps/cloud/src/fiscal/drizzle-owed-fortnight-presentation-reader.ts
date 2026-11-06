import {
  fortnightPeriod,
  isHeldBackOnlyByRevokedInstallations,
  owedFortnightPresentationState,
  revokedInstallationsAwaitingConfirmation,
  type ZoneRulesSource,
} from "@purosur/domain";
import type {
  OwedFortnightPresentation,
  OwedFortnightPresentationReader,
} from "@purosur/domain/alerts/use-cases";
import type { RegisterEventStreams } from "@purosur/domain/fiscal/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { DrizzleRevokedInstallationConfirmations } from "./drizzle-revoked-installation-confirmations.js";
import { owedFortnightReportsWithState } from "./owed-fortnight-reports.js";

export class DrizzleOwedFortnightPresentationReader<TQueryResult extends PgQueryResultHKT>
  implements OwedFortnightPresentationReader
{
  private readonly db: PgDatabase<TQueryResult>;
  private readonly streams: RegisterEventStreams;
  private readonly zoneRules: ZoneRulesSource;

  constructor(
    db: PgDatabase<TQueryResult>,
    streams: RegisterEventStreams,
    zoneRules: ZoneRulesSource,
  ) {
    this.db = db;
    this.streams = streams;
    this.zoneRules = zoneRules;
  }

  async owedPresentations(today: string): Promise<OwedFortnightPresentation[]> {
    const rules = this.zoneRules.zoneRules();
    const owed = await owedFortnightReportsWithState(this.db, today, rules);
    const confirmations = new DrizzleRevokedInstallationConfirmations(this.db);
    return Promise.all(
      owed.map(async ({ owed: { pointOfSaleNumber, registerId, code }, state, listed }) => {
        const installations = await this.streams.installationsOf(registerId);
        const confirmed = await confirmations.confirmedInstallations({
          pointOfSaleNumber,
          fortnight: code.fortnight,
        });
        const period = fortnightPeriod(code.fortnight, rules);
        const revokedInstallations = isHeldBackOnlyByRevokedInstallations(
          installations,
          period,
          confirmed,
        )
          ? revokedInstallationsAwaitingConfirmation(installations, period, confirmed).flatMap(
              ({ installationId, revokedAt }) => (revokedAt ? [{ installationId, revokedAt }] : []),
            )
          : [];
        return {
          pointOfSaleNumber,
          registerId,
          fortnight: code.fortnight,
          taxAuthorityDeadline: code.reportDeadline,
          state: owedFortnightPresentationState({ state, listed }),
          listed,
          revokedInstallations,
        };
      }),
    );
  }
}
