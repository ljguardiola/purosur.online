import {
  compareCodeUnits,
  fortnightPeriod,
  fortnightPresentationRows,
  fortnightReportDeadline,
  isFortnightPresentationOwed,
  isFortnightReportOutstanding,
  isHeldBackOnlyByRevokedInstallations,
  revokedInstallationsAwaitingConfirmation,
  type ZoneRulesSource,
} from "@purosur/domain";
import type {
  BranchFortnightPresentation,
  FortnightPresentationReader,
  RegisterEventStreams,
} from "@purosur/domain/fiscal/use-cases";
import { inArray } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { fortnightDocumentReports, offlineFiscalDocuments } from "../platform/db/schema.js";
import { recordedRemedies, remedyKey } from "./drizzle-rejected-document-remedies.js";
import { DrizzleRevokedInstallationConfirmations } from "./drizzle-revoked-installation-confirmations.js";
import { closedFortnightPresentations } from "./owed-fortnight-reports.js";

export class DrizzleFortnightPresentationReader<TQueryResult extends PgQueryResultHKT>
  implements FortnightPresentationReader
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

  async branchPresentations(
    locationId: string,
    today: string,
  ): Promise<BranchFortnightPresentation[]> {
    const presentations = await closedFortnightPresentations(
      this.db,
      today,
      this.zoneRules.zoneRules(),
      locationId,
    );
    const pointsOfSale = [...new Set(presentations.map(({ owed }) => owed.pointOfSaleNumber))];
    const documents =
      pointsOfSale.length === 0
        ? []
        : await this.db
            .select({
              pointOfSale: offlineFiscalDocuments.pointOfSale,
              fortnightStart: offlineFiscalDocuments.fortnightStart,
              documentType: offlineFiscalDocuments.documentType,
              number: offlineFiscalDocuments.number,
              id: offlineFiscalDocuments.id,
              issuedOn: offlineFiscalDocuments.issuedOn,
              total: offlineFiscalDocuments.total,
              netAmount: offlineFiscalDocuments.netAmount,
              buyerDocumentType: offlineFiscalDocuments.buyerDocumentType,
              buyerDocumentNumber: offlineFiscalDocuments.buyerDocumentNumber,
              buyerTaxStatusCode: offlineFiscalDocuments.buyerTaxStatusCode,
            })
            .from(offlineFiscalDocuments)
            .where(inArray(offlineFiscalDocuments.pointOfSale, pointsOfSale));
    const documentReports =
      pointsOfSale.length === 0
        ? []
        : await this.db
            .select({
              pointOfSale: fortnightDocumentReports.pointOfSaleNumber,
              fortnightStart: fortnightDocumentReports.fortnightStart,
              documentType: fortnightDocumentReports.documentType,
              state: fortnightDocumentReports.state,
              reportedThrough: fortnightDocumentReports.reportedThrough,
              rejectedNumber: fortnightDocumentReports.rejectedNumber,
              lastAttemptAt: fortnightDocumentReports.lastAttemptAt,
              rejections: fortnightDocumentReports.rejections,
            })
            .from(fortnightDocumentReports)
            .where(inArray(fortnightDocumentReports.pointOfSaleNumber, pointsOfSale));
    const { corrections, remedyOf } = await recordedRemedies(this.db, { pointsOfSale });
    const confirmations = new DrizzleRevokedInstallationConfirmations(this.db);
    const revokedInstallationsOf = new Map(
      await Promise.all(
        presentations.map(
          async ({
            owed: { pointOfSaleNumber, registerId, code },
            state,
          }): Promise<[string, BranchFortnightPresentation["revokedInstallations"]]> => {
            const key = `${pointOfSaleNumber}:${code.fortnight.start}`;
            if (!isFortnightReportOutstanding(state)) {
              return [key, []];
            }
            const installations = await this.streams.installationsOf(registerId);
            const confirmed = await confirmations.confirmedInstallations({
              pointOfSaleNumber,
              fortnight: code.fortnight,
            });
            const period = fortnightPeriod(code.fortnight, this.zoneRules.zoneRules());
            if (!isHeldBackOnlyByRevokedInstallations(installations, period, confirmed)) {
              return [key, []];
            }
            const awaiting = revokedInstallationsAwaitingConfirmation(
              installations,
              period,
              confirmed,
            ).flatMap(({ installationId, revokedAt }) =>
              revokedAt ? [{ installationId, revokedAt }] : [],
            );
            return [key, awaiting];
          },
        ),
      ),
    );
    return presentations
      .flatMap(({ owed: { pointOfSaleNumber, registerId, code }, state, movement, listed }) => {
        const isOfThisPresentation = (row: { pointOfSale: number; fortnightStart: string }) =>
          row.pointOfSale === pointOfSaleNumber && row.fortnightStart === code.fortnight.start;
        return fortnightPresentationRows({
          state,
          movement,
          documents: documents.filter(isOfThisPresentation).map((document) => ({
            ...document,
            correction:
              corrections.get(
                remedyKey(
                  pointOfSaleNumber,
                  document.fortnightStart,
                  document.documentType,
                  document.number,
                ),
              ) ?? null,
          })),
          documentReports: documentReports.filter(isOfThisPresentation).map((report) => ({
            ...report,
            rejections: report.rejections ?? [],
            remedy: remedyOf(report),
          })),
          listedAsOwed: listed,
        }).map((row) => ({
          ...row,
          registerId,
          pointOfSaleNumber,
          revokedInstallations:
            revokedInstallationsOf.get(`${pointOfSaleNumber}:${code.fortnight.start}`) ?? [],
          fortnight: code.fortnight,
          deadline: fortnightReportDeadline(code.fortnight, code.reportDeadline),
          owed: isFortnightPresentationOwed({ state, listed }),
        }));
      })
      .sort(
        (a, b) =>
          compareCodeUnits(b.fortnight.start, a.fortnight.start) ||
          a.pointOfSaleNumber - b.pointOfSaleNumber,
      );
  }
}
