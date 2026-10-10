PRAGMA defer_foreign_keys = ON;

CREATE TABLE fiscal_documents_held AS
  SELECT id, sale_id, point_of_sale, document_type, number, issued_on, document, state,
         authorization_code, authorization_code_due_on, reserved_at, resolved_at
  FROM fiscal_documents;

DROP TABLE fiscal_documents;

CREATE TABLE fiscal_documents (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL UNIQUE REFERENCES sales (id),
  point_of_sale INTEGER NOT NULL CHECK (point_of_sale BETWEEN 1 AND 99999),
  document_type TEXT NOT NULL CHECK (document_type IN ('factura_c')),
  number INTEGER NOT NULL CHECK (number > 0),
  issued_on TEXT NOT NULL,
  document TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('REQUESTING', 'AUTHORIZED', 'REJECTED', 'UNKNOWN')),
  authorization_code TEXT,
  authorization_code_due_on TEXT,
  reserved_at TEXT NOT NULL,
  resolved_at TEXT,
  CHECK (
    (state = 'AUTHORIZED' AND authorization_code IS NOT NULL AND authorization_code_due_on IS NOT NULL)
    OR (state <> 'AUTHORIZED' AND authorization_code IS NULL AND authorization_code_due_on IS NULL)
  ),
  CHECK ((state = 'REQUESTING') = (resolved_at IS NULL))
);

INSERT INTO fiscal_documents (
  id, sale_id, point_of_sale, document_type, number, issued_on, document, state,
  authorization_code, authorization_code_due_on, reserved_at, resolved_at
)
  SELECT id, sale_id, point_of_sale,
         CASE document_type WHEN 'FACTURA_C' THEN 'factura_c' END,
         number, issued_on, document, state,
         authorization_code, authorization_code_due_on, reserved_at, resolved_at
  FROM fiscal_documents_held;

DROP TABLE fiscal_documents_held;

CREATE UNIQUE INDEX fiscal_documents_one_waiting
  ON fiscal_documents (point_of_sale, document_type)
  WHERE state IN ('REQUESTING', 'UNKNOWN');

CREATE UNIQUE INDEX fiscal_documents_number_in_use
  ON fiscal_documents (point_of_sale, document_type, number)
  WHERE state <> 'REJECTED';
