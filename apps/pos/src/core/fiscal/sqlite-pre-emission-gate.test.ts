import type { FacturaC } from "@purosur/domain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type LocalDatabase, openLocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import {
  insertPreEmissionGateOutcome,
  readBuyerTaxStatusSetInEffect,
  readIssuerIdentificationInEffect,
} from "./sqlite-pre-emission-gate";

const NOW = new Date("2026-10-01T12:00:00.000Z");

const DOCUMENT: FacturaC = {
  invoiceClass: "C",
  total: 5900,
  netAmount: 5900,
  vatAmount: 0,
  issuer: {
    legalName: "Comercio de Prueba",
    cuit: "20000000000",
    taxStatus: "Condicion de prueba",
    grossIncomeRegistration: "901-000000-0",
    activityStartDate: "2020-01-15",
    version: 2,
  },
  buyerTaxStatusCode: 90,
};

let database: LocalDatabase;

function addSale(id: string): void {
  database
    .prepare(
      "INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at) VALUES (?, 'register-1', 'device-1', 'session-1', 'cashier', 'COMPLETED', ?)",
    )
    .run(id, NOW.toISOString());
}

function addIssuerVersion(version: number, legalName: string | null = "Comercio de Prueba"): void {
  database
    .prepare(
      `INSERT INTO issuer_identification_versions (
         version, legal_name, gross_income_registration, activity_start_date, authorized_cuit, tax_status
       ) VALUES (?, ?, '901-000000-0', '2020-01-15', '20000000000', 'Condicion de prueba')`,
    )
    .run(version, legalName);
}

function addBuyerTaxStatusSet(paramsVersion: number, options: object[]): void {
  database
    .prepare("INSERT INTO buyer_tax_status_sets (params_version, set_id, options) VALUES (?, ?, ?)")
    .run(paramsVersion, `set-`, JSON.stringify(options));
}

function storedOutcomes() {
  return database
    .prepare<
      [],
      {
        sale_id: string;
        evaluated_at: string;
        outcome: string;
        failure_reason: string | null;
        document: string | null;
      }
    >(
      "SELECT sale_id, evaluated_at, outcome, failure_reason, document FROM pre_emission_gate_outcomes ORDER BY sale_id",
    )
    .all();
}

beforeEach(() => {
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS);
  database
    .prepare(
      `INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
       VALUES ('session-1', 'register-1', 'device-1', 'cashier', '2026-10-01T08:00:00.000Z', 0, 'OPEN')`,
    )
    .run();
});

afterEach(() => {
  database.close();
});

describe("the issuer identification in effect", () => {
  it("is none before the register received one", () => {
    expect(readIssuerIdentificationInEffect(database)).toBeUndefined();
  });

  it("is the latest version delivered", () => {
    addIssuerVersion(3, null);
    addIssuerVersion(2);

    expect(readIssuerIdentificationInEffect(database)).toEqual({
      legalName: null,
      grossIncomeRegistration: "901-000000-0",
      activityStartDate: "2020-01-15",
      authorizedCuit: "20000000000",
      taxStatus: "Condicion de prueba",
      version: 3,
    });
  });
});

describe("the buyer tax-status set in effect", () => {
  it("is none before the register received one", () => {
    expect(readBuyerTaxStatusSetInEffect(database)).toBeUndefined();
  });

  it("is the set with the highest params version", () => {
    addBuyerTaxStatusSet(2, [{ code: 7, description: "Consumidor Final", invoice_class: "A/C" }]);
    addBuyerTaxStatusSet(1, [{ code: 90, description: "Condicion de prueba", invoice_class: "B" }]);

    expect(readBuyerTaxStatusSetInEffect(database)).toEqual([
      { code: 7, description: "Consumidor Final", invoiceClass: "A/C" },
    ]);
  });
});

describe("the pre-emission gate outcomes recorded", () => {
  beforeEach(() => {
    addSale("sale-1");
    addSale("sale-2");
  });

  it("keep a passed outcome with the document composed then", () => {
    insertPreEmissionGateOutcome(database, {
      saleId: "sale-1",
      evaluatedAt: NOW,
      outcome: { kind: "passed", document: DOCUMENT },
    });

    expect(storedOutcomes()).toEqual([
      {
        sale_id: "sale-1",
        evaluated_at: NOW.toISOString(),
        outcome: "PASSED",
        failure_reason: null,
        document: JSON.stringify(DOCUMENT),
      },
    ]);
  });

  it("keep a failed outcome with its reason", () => {
    insertPreEmissionGateOutcome(database, {
      saleId: "sale-1",
      evaluatedAt: NOW,
      outcome: { kind: "failed", reason: "legal_name_missing" },
    });

    expect(storedOutcomes()).toEqual([
      {
        sale_id: "sale-1",
        evaluated_at: NOW.toISOString(),
        outcome: "FAILED",
        failure_reason: "legal_name_missing",
        document: null,
      },
    ]);
  });

  it("are one per sale", () => {
    const record = () =>
      insertPreEmissionGateOutcome(database, {
        saleId: "sale-1",
        evaluatedAt: NOW,
        outcome: { kind: "failed", reason: "legal_name_missing" },
      });
    record();

    expect(record).toThrow(/UNIQUE|PRIMARY KEY/);
  });

  it("refuse a row that is both passed and failed", () => {
    const insert = (outcome: string, reason: string | null, document: string | null) =>
      database
        .prepare(
          "INSERT INTO pre_emission_gate_outcomes (sale_id, evaluated_at, outcome, failure_reason, document) VALUES ('sale-2', ?, ?, ?, ?)",
        )
        .run(NOW.toISOString(), outcome, reason, document);

    expect(() => insert("PASSED", "legal_name_missing", "{}")).toThrow(/CHECK/);
    expect(() => insert("PASSED", null, null)).toThrow(/CHECK/);
    expect(() => insert("FAILED", null, null)).toThrow(/CHECK/);
    expect(() => insert("FAILED", "legal_name_missing", "{}")).toThrow(/CHECK/);
  });
});
