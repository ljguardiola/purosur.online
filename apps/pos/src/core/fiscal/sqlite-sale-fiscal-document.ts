import {
  type AuthorizedFacturaC,
  type FacturaC,
  IN_PROGRESS_FISCAL_DOCUMENT_STATES,
} from "@purosur/domain";
import type { LocalDatabase } from "../platform/local-database";

type SaleFiscalDocument =
  | { kind: "none" }
  | { kind: "awaiting" }
  | { kind: "authorized"; authorized: AuthorizedFacturaC };

interface FiscalDocumentRow {
  state: string;
  point_of_sale: number;
  number: number;
  issued_on: string;
  document: string;
  authorization_code: string | null;
  authorization_code_due_on: string | null;
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
    return { kind: "none" };
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
