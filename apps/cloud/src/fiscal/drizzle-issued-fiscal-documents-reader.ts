import {
  CAEA_DOCUMENT_ISSUED_STATE,
  CREDIT_NOTE_C_DOCUMENT_TYPE,
  CREDIT_NOTE_C_VOUCHER_TYPE,
  FACTURA_C_VOUCHER_TYPE,
  FINAL_CONSUMER_DOCUMENT_NUMBER,
  FINAL_CONSUMER_DOCUMENT_TYPE,
  type IssuedDocumentKind,
  type IssuedDocumentState,
  LISTED_ONLINE_DOCUMENT_STATES,
} from "@purosur/domain";
import type {
  IssuedFiscalDocument,
  IssuedFiscalDocumentsPage,
  IssuedFiscalDocumentsQuery,
  IssuedFiscalDocumentsReader,
} from "@purosur/domain/fiscal/use-cases";
import { and, desc, eq, type SQL, sql } from "drizzle-orm";
import { type PgDatabase, type PgQueryResultHKT, unionAll } from "drizzle-orm/pg-core";
import {
  creditNotes,
  fiscalRequests,
  offlineFiscalDocuments,
  registers,
} from "../platform/db/schema.js";

function literal<T extends string | number>(value: T): SQL<T> {
  return sql.raw(typeof value === "number" ? String(value) : `'${value}'`) as SQL<T>;
}

function matches(column: SQL | null, value: string | null): SQL {
  return value === null ? sql`${column} is null` : sql`${column} = ${value}`;
}

function listedState(requested: SQL, answer: SQL, decision: SQL): SQL<IssuedDocumentState> {
  const listed = LISTED_ONLINE_DOCUMENT_STATES.map(
    (facts) =>
      sql`when (${requested}) = ${sql.raw(String(facts.requested))} and ${matches(answer, facts.answer)} and ${matches(decision, facts.decision)} then ${literal(facts.state)}`,
  );
  return sql`case ${sql.join(listed, sql` `)} end`;
}

const timestamp = (value: SQL<Date>) =>
  sql<Date>`${value}`.mapWith((stored: string | Date) => new Date(stored));
const day = (column: SQL) => sql<string>`(${column})::text`;
const nullDay = sql<string | null>`null::text`;
const nullNumber = sql<number | null>`null::int`;

function onlineReceipts() {
  const code = sql<
    string | null
  >`coalesce(${fiscalRequests.adoptedAuthorizationCode}, ${fiscalRequests.authorizationCode})`;
  const dueOn = sql`coalesce(${fiscalRequests.adoptedAuthorizationCodeDueOn}, ${fiscalRequests.authorizationCodeDueOn})`;
  return {
    kind: sql<IssuedDocumentKind>`${literal("receipt")}::text`.as("kind"),
    voucherType: sql<number>`${literal(FACTURA_C_VOUCHER_TYPE)}::int`.as("voucherType"),
    pointOfSale: sql<number>`${fiscalRequests.pointOfSale}`.as("pointOfSale"),
    number: sql<number>`${fiscalRequests.number}`.as("number"),
    issuedOn: day(sql`${fiscalRequests.issuedOn}`).as("issuedOn"),
    issuedAt: timestamp(sql`${fiscalRequests.receivedAt}`).as("issuedAt"),
    registerId: sql<string>`${registers.id}::text`.as("registerId"),
    registerName: sql<string>`${registers.name}`.as("registerName"),
    locationId: sql<string>`${registers.locationId}::text`.as("locationId"),
    state: listedState(
      sql`true`,
      sql`${fiscalRequests.answerKind}`,
      sql`${fiscalRequests.decision}`,
    ).as("state"),
    authorizationKind: sql<string | null>`case when ${code} is not null then 'cae' end`.as(
      "authorizationKind",
    ),
    authorizationCode: code.as("authorizationCode"),
    authorizationDueOn: sql<string | null>`(${dueOn})::text`.as("authorizationDueOn"),
    fortnightStart: nullDay.as("fortnightStart"),
    fortnightEnd: nullDay.as("fortnightEnd"),
    contingency: sql<boolean>`false`.as("contingency"),
    total: sql<number>`${fiscalRequests.total}`.mapWith(Number).as("total"),
    correctedVoucherType: nullNumber.as("correctedVoucherType"),
    correctedPointOfSale: nullNumber.as("correctedPointOfSale"),
    correctedNumber: nullNumber.as("correctedNumber"),
    saleId: sql<string>`${fiscalRequests.saleId}::text`.as("saleId"),
    buyerDocumentType: sql<number>`${literal(FINAL_CONSUMER_DOCUMENT_TYPE)}::int`.as(
      "buyerDocumentType",
    ),
    buyerDocumentNumber: sql<number>`${literal(FINAL_CONSUMER_DOCUMENT_NUMBER)}::bigint`
      .mapWith(Number)
      .as("buyerDocumentNumber"),
  };
}

function onlineCreditNotes() {
  return {
    kind: sql<IssuedDocumentKind>`${literal("credit_note")}::text`.as("kind"),
    voucherType: sql<number>`${literal(CREDIT_NOTE_C_VOUCHER_TYPE)}::int`.as("voucherType"),
    pointOfSale: sql<number>`${creditNotes.pointOfSale}`.as("pointOfSale"),
    number: sql<number>`${creditNotes.number}`.as("number"),
    issuedOn: day(sql`${creditNotes.issuedOn}`).as("issuedOn"),
    issuedAt: timestamp(sql`${creditNotes.requestedAt}`).as("issuedAt"),
    registerId: sql<string>`${registers.id}::text`.as("registerId"),
    registerName: sql<string>`${registers.name}`.as("registerName"),
    locationId: sql<string>`${registers.locationId}::text`.as("locationId"),
    state: listedState(
      sql`${creditNotes.number} is not null`,
      sql`${creditNotes.answerKind}`,
      sql`null::text`,
    ).as("state"),
    authorizationKind: sql<
      string | null
    >`case when ${creditNotes.authorizationCode} is not null then 'cae' end`,
    authorizationCode: sql<string | null>`${creditNotes.authorizationCode}`.as("authorizationCode"),
    authorizationDueOn: sql<string | null>`(${creditNotes.authorizationCodeDueOn})::text`.as(
      "authorizationDueOn",
    ),
    fortnightStart: nullDay.as("fortnightStart"),
    fortnightEnd: nullDay.as("fortnightEnd"),
    contingency: sql<boolean>`false`.as("contingency"),
    total: sql<number>`${creditNotes.total}`.mapWith(Number).as("total"),
    correctedVoucherType: sql<number | null>`${creditNotes.associatedVoucherType}`.as(
      "correctedVoucherType",
    ),
    correctedPointOfSale: sql<number | null>`${creditNotes.associatedPointOfSale}`.as(
      "correctedPointOfSale",
    ),
    correctedNumber: sql<number | null>`${creditNotes.associatedNumber}`.as("correctedNumber"),
    saleId: sql<string>`${creditNotes.saleId}::text`.as("saleId"),
    buyerDocumentType: sql<number>`${literal(FINAL_CONSUMER_DOCUMENT_TYPE)}::int`.as(
      "buyerDocumentType",
    ),
    buyerDocumentNumber: sql<number>`${literal(FINAL_CONSUMER_DOCUMENT_NUMBER)}::bigint`
      .mapWith(Number)
      .as("buyerDocumentNumber"),
  };
}

function offlineDocuments() {
  const isCreditNote = sql`${offlineFiscalDocuments.documentType} = ${CREDIT_NOTE_C_DOCUMENT_TYPE}`;
  return {
    kind: sql<IssuedDocumentKind>`case when ${isCreditNote} then 'credit_note' else 'receipt' end`.as(
      "kind",
    ),
    voucherType:
      sql<number>`case when ${isCreditNote} then ${literal(CREDIT_NOTE_C_VOUCHER_TYPE)} else ${literal(FACTURA_C_VOUCHER_TYPE)} end`.as(
        "voucherType",
      ),
    pointOfSale: sql<number>`${offlineFiscalDocuments.pointOfSale}`.as("pointOfSale"),
    number: sql<number>`${offlineFiscalDocuments.number}`.as("number"),
    issuedOn: day(sql`${offlineFiscalDocuments.issuedOn}`).as("issuedOn"),
    issuedAt: timestamp(sql`${offlineFiscalDocuments.generatedAt}`).as("issuedAt"),
    registerId: sql<string>`${registers.id}::text`.as("registerId"),
    registerName: sql<string>`${registers.name}`.as("registerName"),
    locationId: sql<string>`${registers.locationId}::text`.as("locationId"),
    state: sql<IssuedDocumentState>`${literal(CAEA_DOCUMENT_ISSUED_STATE)}::text`.as("state"),
    authorizationKind: sql<string | null>`${literal("caea")}::text`.as("authorizationKind"),
    authorizationCode: sql<string | null>`${offlineFiscalDocuments.offlineAuthorizationCode}`.as(
      "authorizationCode",
    ),
    authorizationDueOn: nullDay.as("authorizationDueOn"),
    fortnightStart: day(sql`${offlineFiscalDocuments.fortnightStart}`).as("fortnightStart"),
    fortnightEnd: day(sql`${offlineFiscalDocuments.fortnightEnd}`).as("fortnightEnd"),
    contingency: sql<boolean>`true`.as("contingency"),
    total: sql<number>`${offlineFiscalDocuments.total}`.mapWith(Number).as("total"),
    correctedVoucherType: sql<number | null>`${offlineFiscalDocuments.correctedVoucherType}`.as(
      "correctedVoucherType",
    ),
    correctedPointOfSale: sql<number | null>`${offlineFiscalDocuments.correctedPointOfSale}`.as(
      "correctedPointOfSale",
    ),
    correctedNumber: sql<number | null>`${offlineFiscalDocuments.correctedNumber}`.as(
      "correctedNumber",
    ),
    saleId: sql<string>`${offlineFiscalDocuments.saleId}::text`.as("saleId"),
    buyerDocumentType: sql<number>`${offlineFiscalDocuments.buyerDocumentType}`.as(
      "buyerDocumentType",
    ),
    buyerDocumentNumber: sql<number>`${offlineFiscalDocuments.buyerDocumentNumber}`
      .mapWith(Number)
      .as("buyerDocumentNumber"),
  };
}

export function issuedDocuments<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
) {
  return unionAll(
    db
      .select(onlineReceipts())
      .from(fiscalRequests)
      .innerJoin(registers, eq(registers.id, fiscalRequests.registerId)),
    db
      .select(onlineCreditNotes())
      .from(creditNotes)
      .innerJoin(registers, eq(registers.id, creditNotes.registerId)),
    db
      .select(offlineDocuments())
      .from(offlineFiscalDocuments)
      .innerJoin(registers, eq(registers.id, offlineFiscalDocuments.registerId)),
  ).as("issued");
}

export class DrizzleIssuedFiscalDocumentsReader<TQueryResult extends PgQueryResultHKT>
  implements IssuedFiscalDocumentsReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async issuedInPeriod({
    locationId,
    range,
    registerId,
    kind,
    number,
    page,
  }: IssuedFiscalDocumentsQuery): Promise<IssuedFiscalDocumentsPage> {
    const issued = issuedDocuments(this.db);
    const listed = and(
      eq(issued.locationId, locationId),
      sql`${issued.state} is not null`,
      sql`${issued.issuedOn} >= ${range.from}`,
      sql`${issued.issuedOn} <= ${range.to}`,
      registerId === undefined ? undefined : eq(issued.registerId, registerId),
      kind === undefined ? undefined : eq(issued.kind, kind),
      number === undefined ? undefined : eq(issued.number, number),
    );
    const [rows, [counted]] = await Promise.all([
      this.db
        .select()
        .from(issued)
        .where(listed)
        .orderBy(
          desc(issued.issuedOn),
          desc(issued.issuedAt),
          desc(issued.pointOfSale),
          desc(issued.number),
        )
        .limit(page.size)
        .offset((page.number - 1) * page.size),
      this.db
        .select({ total: sql<number>`count(*)`.mapWith(Number) })
        .from(issued)
        .where(listed),
    ]);
    return { documents: rows.map(documentOf), total: counted?.total ?? 0 };
  }
}

export interface IssuedRow {
  kind: IssuedDocumentKind;
  voucherType: number;
  pointOfSale: number;
  number: number;
  issuedOn: string;
  issuedAt: Date;
  registerId: string;
  registerName: string;
  state: IssuedDocumentState;
  authorizationKind: string | null;
  authorizationCode: string | null;
  authorizationDueOn: string | null;
  fortnightStart: string | null;
  fortnightEnd: string | null;
  contingency: boolean;
  total: number;
  correctedVoucherType: number | null;
  correctedPointOfSale: number | null;
  correctedNumber: number | null;
  saleId: string;
  buyerDocumentType: number;
  buyerDocumentNumber: number;
}

function authorizationOf(row: IssuedRow): IssuedFiscalDocument["authorization"] {
  if (row.authorizationCode === null) {
    return null;
  }
  if (row.authorizationKind === "caea") {
    return {
      kind: "caea",
      code: row.authorizationCode,
      fortnightStart: row.fortnightStart ?? row.issuedOn,
      fortnightEnd: row.fortnightEnd ?? row.issuedOn,
    };
  }
  return {
    kind: "cae",
    code: row.authorizationCode,
    dueOn: row.authorizationDueOn ?? row.issuedOn,
  };
}

export function documentOf(row: IssuedRow): IssuedFiscalDocument {
  return {
    kind: row.kind,
    voucherType: row.voucherType,
    pointOfSale: row.pointOfSale,
    number: row.number,
    issuedOn: row.issuedOn,
    issuedAt: row.issuedAt,
    register: { id: row.registerId, name: row.registerName },
    authorization: authorizationOf(row),
    state: row.state,
    contingency: row.contingency,
    total: row.total,
    correctedVoucher:
      row.correctedVoucherType === null ||
      row.correctedPointOfSale === null ||
      row.correctedNumber === null
        ? null
        : {
            voucherType: row.correctedVoucherType,
            pointOfSale: row.correctedPointOfSale,
            number: row.correctedNumber,
          },
  };
}
