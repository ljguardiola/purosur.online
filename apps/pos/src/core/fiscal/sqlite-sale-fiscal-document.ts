import {
  type AuthorizedFacturaC,
  type DeferredSaleReference,
  type FacturaC,
  IN_PROGRESS_FISCAL_DOCUMENT_STATES,
  isDeferralPending,
  type ReceiptSource,
} from "@purosur/domain";
import type { LocalDatabase } from "../platform/local-database";

type SaleFiscalDocument =
  | { kind: "none" }
  | { kind: "awaiting" }
  | { kind: "deferred"; deferred: DeferredSaleReference }
  | { kind: "authorized"; authorized: AuthorizedFacturaC }
  | Extract<ReceiptSource["fiscal"], { kind: "offline_authorized" }>;

interface FiscalDocumentRow {
  state: string;
  point_of_sale: number;
  number: number;
  issued_on: string;
  document: string;
  authorization_code: string | null;
  authorization_code_due_on: string | null;
}

interface OfflineFiscalDocumentRow {
  point_of_sale: number;
  number: number;
  issued_on: string;
  document: string;
  offline_authorization_code: string;
  fortnight_start: string;
  fortnight_end: string;
}

interface DeferredSaleRow {
  id: string;
  short_code: string;
  satisfied: 0 | 1;
}

function pendingDeferredSale(database: LocalDatabase, saleId: string): SaleFiscalDocument {
  const deferred = database
    .prepare<[string], DeferredSaleRow>(
      "SELECT id, short_code, (satisfied_at IS NOT NULL) AS satisfied FROM deferred_sales WHERE sale_id = ?",
    )
    .get(saleId);
  if (deferred === undefined || !isDeferralPending({ satisfied: deferred.satisfied === 1 })) {
    return { kind: "none" };
  }
  return { kind: "deferred", deferred: { id: deferred.id, shortCode: deferred.short_code } };
}

function offlineDocumentOf(database: LocalDatabase, saleId: string): SaleFiscalDocument | null {
  const row = database
    .prepare<[string], OfflineFiscalDocumentRow>(
      `SELECT point_of_sale, number, issued_on, document, offline_authorization_code,
              fortnight_start, fortnight_end
       FROM offline_fiscal_documents WHERE sale_id = ?`,
    )
    .get(saleId);
  if (row === undefined) {
    return null;
  }
  return {
    kind: "offline_authorized",
    authorized: {
      pointOfSale: row.point_of_sale,
      number: row.number,
      issuedOn: row.issued_on,
      document: JSON.parse(row.document) as FacturaC,
      offlineAuthorizationCode: row.offline_authorization_code,
      fortnight: { start: row.fortnight_start, end: row.fortnight_end },
    },
  };
}

export function readSaleFiscalDocument(
  database: LocalDatabase,
  saleId: string,
): SaleFiscalDocument {
  const row = database
    .prepare<string[], FiscalDocumentRow>(
      `SELECT state, point_of_sale, number, issued_on, document, authorization_code,
              authorization_code_due_on
       FROM fiscal_documents
       WHERE sale_id = ?
         AND state IN ('AUTHORIZED', ${IN_PROGRESS_FISCAL_DOCUMENT_STATES.map(() => "?").join(", ")})`,
    )
    .get(saleId, ...IN_PROGRESS_FISCAL_DOCUMENT_STATES);
  if (row === undefined) {
    return offlineDocumentOf(database, saleId) ?? pendingDeferredSale(database, saleId);
  }
  if (row.state !== "AUTHORIZED") {
    return { kind: "awaiting" };
  }
  if (row.authorization_code === null || row.authorization_code_due_on === null) {
    throw new Error("the authorized fiscal document has no authorization code");
  }
  return {
    kind: "authorized",
    authorized: {
      pointOfSale: row.point_of_sale,
      number: row.number,
      issuedOn: row.issued_on,
      document: JSON.parse(row.document) as FacturaC,
      authorizationCode: row.authorization_code,
      authorizationCodeDueOn: row.authorization_code_due_on,
    },
  };
}
