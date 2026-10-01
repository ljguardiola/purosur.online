import type { FacturaC } from "@purosur/domain";
import { evaluatePreEmissionGate } from "@purosur/domain/fiscal/use-cases";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type LocalDatabase, openLocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { SqliteFiscalGateLedger } from "./sqlite-fiscal-gate-ledger";

const NOW = new Date("2026-10-01T12:00:00.000Z");
const CHAIN_KEY = Buffer.from("0123456789abcdef0123456789abcdef").toString("base64");

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
let ledger: SqliteFiscalGateLedger;
let idCount: number;

const ids = {
  next: () => {
    idCount += 1;
    return `id-${idCount}`;
  },
};

function evaluate(saleId: string, target = ledger) {
  return evaluatePreEmissionGate({ ledger: target, clock: { now: () => NOW }, ids }, { saleId });
}

function addSale(id: string, state: string, lineTotals: number[] = []): void {
  database
    .prepare(
      "INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at) VALUES (?, 'register-1', 'device-1', 'session-1', 'cashier', ?, ?)",
    )
    .run(id, state, NOW.toISOString());
  lineTotals.forEach((lineTotal, index) => {
    database
      .prepare(
        `INSERT INTO sale_lines (id, sale_id, position, product_id, product_name, quantity, list_unit_price, price_list_id, line_total)
         VALUES (?, ?, ?, ?, 'Producto de prueba', 1, ?, 'list-1', ?)`,
      )
      .run(`${id}-line-${index}`, id, index + 1, `${id}-product-${index}`, lineTotal, lineTotal);
  });
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
    .run(paramsVersion, `set-${paramsVersion}`, JSON.stringify(options));
}

function outboxEvents() {
  return database
    .prepare<[], { event_type: string; aggregate_id: string; device_seq: number }>(
      "SELECT event_type, aggregate_id, device_seq FROM outbox ORDER BY device_seq",
    )
    .all();
}

beforeEach(() => {
  idCount = 0;
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS);
  database.prepare("UPDATE sync_state SET device_id = 'device-1'").run();
  database
    .prepare(
      `INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
       VALUES ('session-1', 'register-1', 'device-1', 'cashier', '2026-10-01T08:00:00.000Z', 0, 'OPEN')`,
    )
    .run();
  ledger = new SqliteFiscalGateLedger(database, CHAIN_KEY);
});

afterEach(() => {
  database.close();
});

describe("the completed sale the gate evaluates", () => {
  it("carries who completed it, its register and the total of each line", () => {
    addSale("sale-1", "COMPLETED", [5000, 900]);

    const sale = ledger.transaction((tx) => tx.completedSale("sale-1"));

    expect(sale).toEqual({
      id: "sale-1",
      registerId: "register-1",
      actorId: "cashier",
      lines: [{ lineTotal: 5000 }, { lineTotal: 900 }],
    });
  });

  it.each(["OPEN", "CANCELLED", "VOIDED"])("does not exist while the sale is %s", (state) => {
    addSale("sale-1", state, [5000]);

    expect(ledger.transaction((tx) => tx.completedSale("sale-1"))).toBeUndefined();
  });

  it("does not exist for an unknown sale", () => {
    expect(ledger.transaction((tx) => tx.completedSale("sale-1"))).toBeUndefined();
  });

  it("leaves out the lines of another sale", () => {
    addSale("sale-1", "COMPLETED", [5000]);
    addSale("sale-2", "COMPLETED", [700]);

    expect(ledger.transaction((tx) => tx.completedSale("sale-2"))?.lines).toEqual([
      { lineTotal: 700 },
    ]);
  });
});

describe("the issuer identification in effect", () => {
  it("is none before the register received one", () => {
    expect(ledger.transaction((tx) => tx.issuerIdentificationInEffect())).toBeUndefined();
  });

  it("is the latest version delivered", () => {
    addIssuerVersion(3, null);
    addIssuerVersion(2);

    expect(ledger.transaction((tx) => tx.issuerIdentificationInEffect())).toEqual({
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
    expect(ledger.transaction((tx) => tx.buyerTaxStatusSetInEffect())).toBeUndefined();
  });

  it("is the set with the highest params version", () => {
    addBuyerTaxStatusSet(2, [{ code: 7, description: "Consumidor Final", invoice_class: "A/C" }]);
    addBuyerTaxStatusSet(1, [{ code: 90, description: "Condicion de prueba", invoice_class: "B" }]);

    expect(ledger.transaction((tx) => tx.buyerTaxStatusSetInEffect())).toEqual([
      { code: 7, description: "Consumidor Final", invoiceClass: "A/C" },
    ]);
  });
});

describe("the recorded pre-emission gate outcomes", () => {
  beforeEach(() => {
    addSale("sale-1", "COMPLETED", [5900]);
    addSale("sale-2", "COMPLETED", [100]);
  });

  it("read back a passed outcome with the document composed then", () => {
    ledger.transaction((tx) =>
      tx.recordPreEmissionGate({
        saleId: "sale-1",
        evaluatedAt: NOW,
        outcome: { kind: "passed", document: DOCUMENT },
      }),
    );

    expect(ledger.transaction((tx) => tx.recordedPreEmissionGate("sale-1"))).toEqual({
      saleId: "sale-1",
      evaluatedAt: NOW,
      outcome: { kind: "passed", document: DOCUMENT },
    });
  });

  it("read back a failed outcome with its reason", () => {
    ledger.transaction((tx) =>
      tx.recordPreEmissionGate({
        saleId: "sale-1",
        evaluatedAt: NOW,
        outcome: { kind: "failed", reason: "legal_name_missing" },
      }),
    );

    expect(ledger.transaction((tx) => tx.recordedPreEmissionGate("sale-1"))).toEqual({
      saleId: "sale-1",
      evaluatedAt: NOW,
      outcome: { kind: "failed", reason: "legal_name_missing" },
    });
  });

  it("exist only for the sale they were recorded for", () => {
    ledger.transaction((tx) =>
      tx.recordPreEmissionGate({
        saleId: "sale-1",
        evaluatedAt: NOW,
        outcome: { kind: "failed", reason: "legal_name_missing" },
      }),
    );

    expect(ledger.transaction((tx) => tx.recordedPreEmissionGate("sale-2"))).toBeUndefined();
  });

  it("are one per sale", () => {
    const record = () =>
      ledger.transaction((tx) =>
        tx.recordPreEmissionGate({
          saleId: "sale-1",
          evaluatedAt: NOW,
          outcome: { kind: "failed", reason: "legal_name_missing" },
        }),
      );
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

  it("answer the outcome of the latest evaluation as the one in force", () => {
    expect(ledger.latestPreEmissionGateOutcome()).toBeUndefined();

    ledger.transaction((tx) =>
      tx.recordPreEmissionGate({
        saleId: "sale-2",
        evaluatedAt: NOW,
        outcome: { kind: "failed", reason: "legal_name_missing" },
      }),
    );
    ledger.transaction((tx) =>
      tx.recordPreEmissionGate({
        saleId: "sale-1",
        evaluatedAt: NOW,
        outcome: { kind: "passed", document: DOCUMENT },
      }),
    );

    expect(ledger.latestPreEmissionGateOutcome()).toEqual({
      kind: "passed",
      document: DOCUMENT,
    });
  });
});

describe("evaluating the gate on the register's database", () => {
  beforeEach(() => {
    addSale("sale-1", "COMPLETED", [5000, 900]);
  });

  it("composes the factura C from the configuration the register received", () => {
    addIssuerVersion(2);
    addBuyerTaxStatusSet(1, [
      { code: 90, description: "Consumidor Final", invoice_class: "A/M/C" },
    ]);

    expect(evaluate("sale-1")).toEqual({ kind: "passed", document: DOCUMENT });
    expect(outboxEvents()).toEqual([]);
  });

  it("records the failure and its chained fiscal_gate_failed event together", () => {
    expect(evaluate("sale-1")).toEqual({
      kind: "failed",
      reason: "issuer_identification_missing",
    });

    expect(outboxEvents()).toEqual([
      { event_type: "fiscal_gate_failed", aggregate_id: "sale-1", device_seq: 1 },
    ]);
    expect(ledger.latestPreEmissionGateOutcome()).toEqual({
      kind: "failed",
      reason: "issuer_identification_missing",
    });
  });

  it("answers what was composed then when asked again after the configuration changed", () => {
    addIssuerVersion(2);
    addBuyerTaxStatusSet(1, [
      { code: 90, description: "Consumidor Final", invoice_class: "A/M/C" },
    ]);
    evaluate("sale-1");

    addIssuerVersion(3, "Otro Comercio de Prueba");

    expect(evaluate("sale-1")).toEqual({ kind: "passed", document: DOCUMENT });
  });

  it("records nothing when the failure event cannot be appended", () => {
    const withoutKey = new SqliteFiscalGateLedger(database, undefined);

    expect(() => evaluate("sale-1", withoutKey)).toThrow("the ledger has no outbox chain key");
    expect(ledger.transaction((tx) => tx.recordedPreEmissionGate("sale-1"))).toBeUndefined();
    expect(outboxEvents()).toEqual([]);
  });
});
