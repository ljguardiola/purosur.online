import { type FacturaC, raisedClockMark } from "@purosur/domain";
import type { LocalDatabase } from "../platform/local-database";
import { clockMarkOf } from "./sqlite-fiscal-series";
import { upsertClockMark } from "./sqlite-sale-authorization";

const FACTURA_C = "factura_c";

interface ReplenishedAuthorizedDocument {
  id: string;
  saleId: string;
  pointOfSale: number;
  number: number;
  issuedOn: string;
  document: FacturaC;
  authorizationCode: string;
  authorizationCodeDueOn: string;
  reservedAt: Date;
  resolvedAt: Date;
}

export function holdReplenishedAuthorizedDocument(
  database: LocalDatabase,
  document: ReplenishedAuthorizedDocument,
): void {
  if (
    database.prepare("SELECT 1 FROM fiscal_documents WHERE id = ?").get(document.id) !== undefined
  ) {
    return;
  }
  database
    .prepare(
      `INSERT INTO fiscal_documents (
         id, sale_id, point_of_sale, document_type, number, issued_on, document, state,
         authorization_code, authorization_code_due_on, reserved_at, resolved_at
       ) VALUES (
         @id, @sale_id, @point_of_sale, @document_type, @number, @issued_on, @document,
         'AUTHORIZED', @authorization_code, @authorization_code_due_on, @reserved_at, @resolved_at
       )`,
    )
    .run({
      id: document.id,
      sale_id: document.saleId,
      point_of_sale: document.pointOfSale,
      document_type: FACTURA_C,
      number: document.number,
      issued_on: document.issuedOn,
      document: JSON.stringify(document.document),
      authorization_code: document.authorizationCode,
      authorization_code_due_on: document.authorizationCodeDueOn,
      reserved_at: document.reservedAt.toISOString(),
      resolved_at: document.resolvedAt.toISOString(),
    });
  upsertClockMark(database, {
    pointOfSale: document.pointOfSale,
    documentType: FACTURA_C,
    reading: raisedClockMark(
      clockMarkOf(database, document.pointOfSale, FACTURA_C),
      document.reservedAt,
    ),
  });
}
