import { encodePinHash } from "@purosur/contracts";
import {
  FICTIONAL_CUIT,
  FICTIONAL_GROSS_INCOME_REGISTRATION,
  FICTIONAL_LEGAL_NAME,
} from "@purosur/domain/fiscal/test-support";
import type { MercadoPagoChargeOrders } from "@purosur/domain/payments/use-cases";
import { derivePinVerifier } from "../../credentials/pin-verifier";
import {
  abandonMercadoPagoChargeFor,
  followMercadoPagoChargeFor,
  startMercadoPagoChargeFor,
} from "../../payments/mercado-pago-charge-requests";
import type { LocalDatabase } from "../../platform/local-database";
import { LOCAL_MIGRATIONS } from "../../platform/local-migrations";
import { migrationClock } from "../../platform/test-support/migration-clock";
import { openLocalDatabase } from "../../platform/test-support/open-local-database";
import { recordCashMovementFor } from "../../register/cash-movement-requests";
import { closeCashSessionFor, openCashSessionFor } from "../../register/cash-session-requests";
import { uuidV7Ids } from "../../register/uuid-v7-ids";
import { createReceiptPrintJobs, type ReceiptPrintJobs } from "../../sales/receipt-print-jobs";
import {
  printCompletedSaleReceiptFor,
  type ReceiptRequestDeps,
  reprintSaleReceiptFor,
} from "../../sales/receipt-requests";
import {
  addWeighedProductFor,
  adjustSaleLineFor,
  applySaleDiscountFor,
  cancelPaidSaleFor,
  changeLineWeightFor,
  chargeSaleByTransferFor,
  chargeSaleInCashFor,
  chargeSaleOnStandaloneTerminalFor,
  currentSaleFor,
  scanProductFor,
} from "../../sales/sale-requests";
import { ControllableReceiptPrinter } from "../../sales/test-support/controllable-receipt-printer";
import { createActionGate } from "../../sessions/action-gate";
import { createSignedInPerson } from "../../sessions/signed-in-person";
import { SqliteSignInStore } from "../../sessions/sqlite-sign-in-store";
import {
  recordInitialCountLineFor,
  withdrawInitialCountLineFor,
} from "../../stock/initial-count-requests";
import { CloudEventInbox } from "../cloud-event-inbox";
import { SqliteLocalOutbox } from "../sqlite-local-outbox";

const START = Date.parse("2026-10-06T11:00:00.000Z");
const STEP_MS = 4 * 60_000;
const OUTBOX_CHAIN_KEY = Buffer.alloc(32, 7).toString("base64");

const DEVICE = "6f0c2a1e-3b54-4d7a-9c10-5e8a7b2d4f01";
const REGISTER = "a41d9e07-52c3-4b68-8f2e-1c7d3a9b6e02";
const ADA = "c7b3e5d2-18a4-4f90-b6d1-2e9f0a8c3d03";
const LOCATION = "1d4e7b9a-2c63-4a80-b5f1-7e3a9c2d6b18";
const ROLE = "e2f8a6b4-7d19-4c35-a0e3-9b1c5d7f2a04";
const GRACE = "4a7c1e9d-3b62-4f05-8d1a-6e2b9c5f3a13";
const MANAGER_ROLE = "8c2e5a1f-6d93-4b47-a1c8-3f7d2b9e6a14";
const YERBA = "0b9d4c7e-6a21-4e83-9f5b-3d8e1a2c7b05";
const SUGAR = "5d1a8f3c-9e47-4b02-8c6d-7a3f2e9b1c06";
const COOKIES = "2e6b9d3f-7a15-4c80-b4e2-8d1f5a3c9b15";
const CHEESE = "9f3b6d1a-4c27-4e80-a5b1-2d7c8e0f3a19";
const PRICE_LIST = "9a6e2b1d-4c78-4f13-b5a0-8e7d3c1f9a07";
const YERBA_PRICE = "3c8f1d5a-2b96-4e70-a4c9-6f1b8d2e5a08";
const SUGAR_PRICE = "7e4a9c2f-1d63-4b85-9e0a-2c5f7b8d1309";
const COOKIES_PRICE = "6a3d8f1c-2e74-4b59-9c0d-5f8a1e3b7c16";
const CHEESE_PRICE = "1b7e4a9d-3c25-4f68-b0d1-8a2c5e7f9b20";
const DISCOUNT = "b5d2f7a1-8c40-4e96-a3b7-1f9e6c4d2a10";
const BUY_THREE_PAY_TWO = "c9f4b2e7-1a58-4d36-8e0b-4a7c3f9d1e17";
const THRESHOLD = "d3e6a9c1-5f28-4b74-8a0d-9c2e7f1b4a11";
const CATEGORY = "f1a7c3e9-4b52-4d68-9e01-7a3c5b8d2f12";
const OFFLINE_NUMBER_BLOCK = "3e9a5c1f-7b24-4d86-a0c3-5f1e8b2d7a21";
const OFFLINE_POINT_OF_SALE = 31;
const PEPPER = Buffer.alloc(32, 9).toString("base64url");
const PIN = "4826";
const PIN_HASH = "hash-of-the-pin";

const OFFLINE_QR_ORDERS: MercadoPagoChargeOrders = {
  requestOrder: async () => ({ kind: "created", expiresAt: new Date("2026-10-09T12:03:00.000Z") }),
  readOrder: async () => ({ kind: "unreachable" }),
  cancelOrder: async () => ({ kind: "unreachable" }),
};

const APPROVED_QR_ORDERS: MercadoPagoChargeOrders = {
  ...OFFLINE_QR_ORDERS,
  readOrder: async () => ({ kind: "read", state: "APPROVED" }),
};

function expectOutcome(step: string, actual: string, expected: string): void {
  if (actual !== expected) {
    throw new Error(`The register session's "${step}" ended as "${actual}", not "${expected}"`);
  }
}

function seed(database: ReturnType<typeof openLocalDatabase>): void {
  for (const [role, name, permissions] of [
    [ROLE, "Cajera", ["sell_and_charge", "record_cash_expense", "record_initial_inventory"]],
    [
      MANAGER_ROLE,
      "Encargada",
      [
        "sell_and_charge",
        "record_cash_expense",
        "withdraw_cash",
        "void_sale",
        "reprint_receipt",
        "override_line_price_or_discount",
        "apply_total_discount",
      ],
    ],
  ] as const) {
    database
      .prepare("INSERT INTO roles (id, name, is_administrator, version) VALUES (?, ?, 0, 1)")
      .run(role, name);
    for (const key of permissions) {
      database
        .prepare("INSERT INTO role_permissions (role_id, permission_key, active) VALUES (?, ?, 1)")
        .run(role, key);
    }
  }
  for (const [user, name, role] of [
    [ADA, "Ada", ROLE],
    [GRACE, "Grace", MANAGER_ROLE],
  ]) {
    database
      .prepare(
        "INSERT INTO users (id, first_name, role_id, salt, active, version) VALUES (?, ?, ?, ?, 1, 1)",
      )
      .run(user, name, role, encodePinHash(new Uint8Array(16).fill(1)));
    database
      .prepare("INSERT INTO pin_verifiers (user_id, verifier) VALUES (?, ?)")
      .run(user, derivePinVerifier(PEPPER, PIN_HASH));
  }
  database
    .prepare("INSERT INTO own_register (id, name, version) VALUES (?, 'Caja 1', 1)")
    .run(REGISTER);
  database.prepare("UPDATE sync_state SET device_id = ?").run(DEVICE);
  database
    .prepare(
      `INSERT INTO branch_settings (location_id, address, whatsapp_number, instagram_handle, weekly_hours, expiring_lot_alert_days, unreviewed_price_alert_days, good_condition_return_days, version)
       VALUES (?, 'Av. Belgrano 1450', '11 5555-0100', '@puro.sur', '{}', 30, 30, 15, 1)`,
    )
    .run(LOCATION);
  database
    .prepare(
      "INSERT INTO buyer_identification_thresholds (id, amount, valid_from) VALUES (?, ?, ?)",
    )
    .run(THRESHOLD, 100_000_000, "2026-01-01");
  for (const [id, name, code] of [
    [YERBA, "Yerba", "7790001000011"],
    [SUGAR, "Azucar", "7790001000028"],
    [COOKIES, "Galletitas", "7790001000035"],
  ]) {
    database
      .prepare(
        "INSERT INTO products (id, name, category_id, sale_unit, active, version) VALUES (?, ?, ?, 'UNIT', 1, 1)",
      )
      .run(id, name, CATEGORY);
    database
      .prepare(
        "INSERT INTO product_barcodes (product_id, position, code, active) VALUES (?, 1, ?, 1)",
      )
      .run(id, code);
  }
  database
    .prepare(
      "INSERT INTO products (id, name, category_id, sale_unit, active, version) VALUES (?, 'Queso cremoso', ?, 'KG', 1, 1)",
    )
    .run(CHEESE, CATEGORY);
  for (const [id, product, amount] of [
    [CHEESE_PRICE, CHEESE, 9000],
    [YERBA_PRICE, YERBA, 1500],
    [SUGAR_PRICE, SUGAR, 2400],
    [COOKIES_PRICE, COOKIES, 900],
  ]) {
    database
      .prepare(
        "INSERT INTO prices (id, product_id, price_list_id, unit_price, valid_from, version) VALUES (?, ?, ?, ?, '2026-09-01T00:00:00.000Z', 1)",
      )
      .run(id, product, PRICE_LIST, amount);
  }
  database
    .prepare(
      `INSERT INTO discounts (id, name, kind, percent, buy_qty, pay_qty, target_kind, target_id, valid_from, valid_to, weekdays, active, version)
       VALUES (?, 'Promo yerba', 'PERCENT_OFF', 10, NULL, NULL, 'PRODUCT', ?, '2026-09-01', '2026-12-31', '[]', 1, 1)`,
    )
    .run(DISCOUNT, YERBA);
  database
    .prepare(
      `INSERT INTO discounts (id, name, kind, percent, buy_qty, pay_qty, target_kind, target_id, valid_from, valid_to, weekdays, active, version)
       VALUES (?, 'Galletitas 3x2', 'BUY_N_PAY_M', NULL, 3, 2, 'PRODUCT', ?, '2026-09-01', '2026-12-31', '[]', 1, 1)`,
    )
    .run(BUY_THREE_PAY_TWO, COOKIES);
}

function holdOfflineAuthorization(database: ReturnType<typeof openLocalDatabase>): void {
  database
    .prepare(
      `INSERT INTO issuer_identification_versions (
         version, legal_name, gross_income_registration, activity_start_date, authorized_cuit, tax_status
       ) VALUES (1, ?, ?, '2020-01-15', ?, 'Monotributo')`,
    )
    .run(FICTIONAL_LEGAL_NAME, FICTIONAL_GROSS_INCOME_REGISTRATION, FICTIONAL_CUIT);
  database
    .prepare(
      "INSERT INTO buyer_tax_status_sets (params_version, set_id, options) VALUES (1, 'set-1', ?)",
    )
    .run(JSON.stringify([{ code: 5, description: "Consumidor Final", invoice_class: "A/M/C" }]));
  database
    .prepare(
      `INSERT INTO register_offline_point_of_sale (
         register_id, point_of_sale_number, tax_authority_last_authorized_number, version
       ) VALUES (?, ?, 0, 1)`,
    )
    .run(REGISTER, OFFLINE_POINT_OF_SALE);
  database
    .prepare(
      `INSERT INTO offline_number_blocks (
         id, point_of_sale, document_type, first_number, last_number, status, version
       ) VALUES (?, ?, 'factura_c', 1, 1000, 'in_use', 1)`,
    )
    .run(OFFLINE_NUMBER_BLOCK, OFFLINE_POINT_OF_SALE);
  database
    .prepare(
      `INSERT INTO offline_authorization_codes (
         fortnight_start, fortnight_end, code, report_deadline, version
       ) VALUES ('2026-10-01', '2026-10-15', '36251478963214', '2026-10-23', 1)`,
    )
    .run();
}

async function untilPrinted(jobs: ReceiptPrintJobs, saleId: string): Promise<void> {
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    if (jobs.standingOf(saleId) === "printed") {
      await new Promise((resolve) => setImmediate(resolve));
      return;
    }
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error("The register session's receipt was never recorded as printed");
}

async function printAndReprintReceipt({
  deps,
  saleId,
  nextStep,
}: {
  deps: Omit<ReceiptRequestDeps, "printers">;
  saleId: string;
  nextStep: () => void;
}): Promise<void> {
  const printer = new ControllableReceiptPrinter();
  const printers = { configured: () => printer };
  nextStep();
  await printCompletedSaleReceiptFor({ ...deps, printers }, saleId);
  nextStep();
  printer.becomeReady();
  await untilPrinted(deps.jobs, saleId);
  nextStep();
  const reprint = await reprintSaleReceiptFor(
    { ...deps, printers },
    {
      saleId,
      reason: "El cliente la perdio",
      authorization: { user_id: GRACE, pin: PIN },
    },
  );
  expectOutcome("reprint the receipt from the history", reprint.kind, "started");
  printer.becomeReady();
  await untilPrinted(deps.jobs, saleId);
}

export interface RegisterSession {
  database: LocalDatabase;
  now: () => Date;
}

export async function withRegisterSession<TResult>(
  use: (session: RegisterSession) => Promise<TResult>,
): Promise<TResult> {
  const database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
  try {
    seed(database);

    let ticks = 0;
    let current = new Date(START);
    const now = () => current;
    const nextStep = () => {
      current = new Date(START + ticks * STEP_MS);
      ticks += 1;
    };

    const signedInPerson = createSignedInPerson();
    signedInPerson.set(ADA);
    const deps = () => ({
      database,
      gate: createActionGate({
        store: new SqliteSignInStore(database),
        signedInPerson,
        readPepper: async () => PEPPER,
        hashPin: async (pin) => (pin === PIN ? PIN_HASH : "hash-of-another-pin"),
        now,
      }),
      readOutboxChainKey: async () => OUTBOX_CHAIN_KEY,
      now,
      ids: uuidV7Ids,
      paidOrderDiscovery: () => "checked" as const,
    });

    for (const [step, request] of [
      ["count a lot of a product", { productId: YERBA, counted: 12_000, expiresOn: "2027-03-31" }],
      [
        "count another lot of the same product",
        { productId: YERBA, counted: 5000, expiresOn: "2027-09-30" },
      ],
      ["count a product sold by weight", { productId: CHEESE, counted: 2500, expiresOn: null }],
    ] as const) {
      nextStep();
      const counted = await recordInitialCountLineFor(deps(), request);
      expectOutcome(step, counted.kind, "recorded");
      if (request.counted === 5000 && counted.kind === "recorded") {
        nextStep();
        const withdrawn = await withdrawInitialCountLineFor(deps(), counted.line.movement_id);
        expectOutcome("withdraw a line of the initial count", withdrawn.kind, "withdrawn");
      }
    }
    nextStep();
    const opened = await openCashSessionFor(deps(), 10_000);
    if (opened.kind !== "opened" || opened.cash_session === null) {
      throw new Error(`The register session's "open the cash session" ended as "${opened.kind}"`);
    }
    nextStep();
    const movement = await recordCashMovementFor(deps(), {
      kind: "CASH_OUT",
      amount: 1800,
      reason: "Compra de bolsas",
      authorization: undefined,
    });
    expectOutcome("record a cash expense", movement.kind, "recorded");
    nextStep();
    const withdrawal = await recordCashMovementFor(deps(), {
      kind: "WITHDRAWAL",
      amount: 1000,
      reason: "Retiro parcial",
      authorization: { user_id: GRACE, pin: PIN },
    });
    expectOutcome("record a withdrawal authorized by PIN", withdrawal.kind, "recorded");
    nextStep();
    const firstScan = await scanProductFor(deps(), "7790001000011");
    expectOutcome("scan the first product", firstScan.kind, "added");
    nextStep();
    const scanned = await scanProductFor(deps(), "7790001000011");
    if (scanned.kind !== "added") {
      throw new Error(`The register session's "scan a product again" ended as "${scanned.kind}"`);
    }
    nextStep();
    const cash = await chargeSaleInCashFor(deps(), { saleId: scanned.sale.id, tendered: 5000 });
    expectOutcome("charge a sale in cash", cash.kind, "completed");
    nextStep();
    const second = await scanProductFor(deps(), "7790001000028");
    if (second.kind !== "added") {
      throw new Error(`The register session's "scan another product" ended as "${second.kind}"`);
    }
    for (const scan of ["first", "second", "third"]) {
      nextStep();
      const cookies = await scanProductFor(deps(), "7790001000035");
      expectOutcome(`scan the ${scan} product on promotion`, cookies.kind, "added");
    }
    nextStep();
    const toTransfer = await currentSaleFor(deps());
    if (toTransfer === null || toTransfer === "not_permitted") {
      throw new Error(`The register session's "read the sale to transfer" found no sale`);
    }
    nextStep();
    const transfer = await chargeSaleByTransferFor(deps(), {
      saleId: second.sale.id,
      amount: toTransfer.total,
    });
    expectOutcome("charge a sale by transfer", transfer.kind, "completed");
    nextStep();
    const weighed = await addWeighedProductFor(deps(), CHEESE, 1250);
    if (weighed.kind !== "added") {
      throw new Error(
        `The register session's "type the weight of a product" ended as "${weighed.kind}"`,
      );
    }
    nextStep();
    const retyped = await changeLineWeightFor(deps(), weighed.sale.lines[0]?.id ?? "", 1500, 1250);
    if (retyped.kind !== "changed") {
      throw new Error(`The register session's "type the weight again" ended as "${retyped.kind}"`);
    }
    nextStep();
    const weighedTransfer = await chargeSaleByTransferFor(deps(), {
      saleId: weighed.sale.id,
      amount: retyped.sale.total,
    });
    expectOutcome("charge a weighed sale by transfer", weighedTransfer.kind, "completed");
    for (const code of ["7790001000011", "7790001000028", "7790001000035"]) {
      nextStep();
      const toAdjust = await scanProductFor(deps(), code);
      expectOutcome("scan a product to adjust", toAdjust.kind, "added");
    }
    nextStep();
    const toAdjustSale = await currentSaleFor(deps());
    if (toAdjustSale === null || toAdjustSale === "not_permitted") {
      throw new Error(`The register session's "read the sale to adjust" found no sale`);
    }
    const [yerbaLine, sugarLine, cookiesLine] = toAdjustSale.lines;
    nextStep();
    const overridden = await adjustSaleLineFor(deps(), {
      lineId: yerbaLine?.id ?? "",
      adjustment: { kind: "PRICE", value: 1200 },
      reason: "Caja abierta",
      authorization: { user_id: GRACE, pin: PIN },
    });
    expectOutcome("override a line's price authorized by PIN", overridden.kind, "changed");
    database
      .prepare(
        "INSERT INTO role_permissions (role_id, permission_key, active) VALUES (?, 'override_line_price_or_discount', 1)",
      )
      .run(ROLE);
    nextStep();
    const percentOff = await adjustSaleLineFor(deps(), {
      lineId: sugarLine?.id ?? "",
      adjustment: { kind: "PERCENT", value: 10 },
      reason: "Cliente frecuente",
      authorization: undefined,
    });
    expectOutcome("give a line a percent discount", percentOff.kind, "changed");
    nextStep();
    const amountOff = await adjustSaleLineFor(deps(), {
      lineId: cookiesLine?.id ?? "",
      adjustment: { kind: "AMOUNT", value: 100 },
      reason: "Envase danado",
      authorization: undefined,
    });
    if (amountOff.kind !== "changed") {
      throw new Error(
        `The register session's "give a line an amount discount" ended as "${amountOff.kind}"`,
      );
    }
    nextStep();
    const adjustedCash = await chargeSaleInCashFor(deps(), {
      saleId: amountOff.sale.id,
      tendered: amountOff.sale.total,
    });
    expectOutcome("charge the sale with adjusted lines", adjustedCash.kind, "completed");
    for (const code of ["7790001000011", "7790001000035"]) {
      nextStep();
      const toDiscount = await scanProductFor(deps(), code);
      expectOutcome("scan a product to discount the total", toDiscount.kind, "added");
    }
    nextStep();
    const discountedSale = await currentSaleFor(deps());
    if (discountedSale === null || discountedSale === "not_permitted") {
      throw new Error(`The register session's "read the sale to discount" found no sale`);
    }
    nextStep();
    const totalDiscount = await applySaleDiscountFor(deps(), {
      discount: { kind: "PERCENT", value: 5 },
      reason: "Compra grande",
      authorization: { user_id: GRACE, pin: PIN },
    });
    if (totalDiscount.kind !== "applied") {
      throw new Error(
        `The register session's "discount the sale's total" ended as "${totalDiscount.kind}"`,
      );
    }
    nextStep();
    const discountedCash = await chargeSaleInCashFor(deps(), {
      saleId: discountedSale.id,
      tendered: totalDiscount.sale.total,
    });
    expectOutcome("charge the sale with a discount on its total", discountedCash.kind, "completed");
    nextStep();
    const split = await scanProductFor(deps(), "7790001000011");
    if (split.kind !== "added") {
      throw new Error(`The register session's "scan a product to split" ended as "${split.kind}"`);
    }
    nextStep();
    const partial = await chargeSaleInCashFor(deps(), { saleId: split.sale.id, tendered: 500 });
    if (partial.kind !== "partially_paid") {
      throw new Error(`The register session's "pay part in cash" ended as "${partial.kind}"`);
    }
    nextStep();
    const rest = await chargeSaleByTransferFor(deps(), {
      saleId: split.sale.id,
      amount: partial.pending,
    });
    expectOutcome("pay the rest by transfer", rest.kind, "completed");
    nextStep();
    const abandoned = await scanProductFor(deps(), "7790001000011");
    if (abandoned.kind !== "added") {
      throw new Error(
        `The register session's "scan a product to abandon" ended as "${abandoned.kind}"`,
      );
    }
    nextStep();
    const abandonedDiscount = await adjustSaleLineFor(deps(), {
      lineId: abandoned.sale.lines[0]?.id ?? "",
      adjustment: { kind: "PERCENT", value: 5 },
      reason: "Cliente frecuente",
      authorization: undefined,
    });
    expectOutcome("discount the sale to abandon", abandonedDiscount.kind, "changed");
    nextStep();
    const abandonedTotalDiscount = await applySaleDiscountFor(deps(), {
      discount: { kind: "AMOUNT", value: 100 },
      reason: "Cliente frecuente",
      authorization: { user_id: GRACE, pin: PIN },
    });
    expectOutcome(
      "discount the total of the sale to abandon",
      abandonedTotalDiscount.kind,
      "applied",
    );
    nextStep();
    const deposit = await chargeSaleInCashFor(deps(), { saleId: abandoned.sale.id, tendered: 500 });
    expectOutcome(
      "pay part of a sale in cash before abandoning it",
      deposit.kind,
      "partially_paid",
    );
    nextStep();
    const transferDeposit = await chargeSaleByTransferFor(deps(), {
      saleId: abandoned.sale.id,
      amount: 300,
    });
    expectOutcome(
      "pay part of a sale by transfer before abandoning it",
      transferDeposit.kind,
      "partially_paid",
    );
    nextStep();
    const cancelled = await cancelPaidSaleFor(deps(), {
      saleId: abandoned.sale.id,
      authorization: { user_id: GRACE, pin: PIN },
    });
    expectOutcome("cancel the part-paid sale authorized by PIN", cancelled.kind, "cancelled");
    nextStep();
    const onTerminal = await scanProductFor(deps(), "7790001000011");
    if (onTerminal.kind !== "added") {
      throw new Error(
        `The register session's "scan a product to pay on the standalone terminal" ended as "${onTerminal.kind}"`,
      );
    }
    nextStep();
    const terminalDeposit = await chargeSaleOnStandaloneTerminalFor(deps(), {
      saleId: onTerminal.sale.id,
      amount: 700,
    });
    expectOutcome(
      "pay part of a sale on the standalone terminal",
      terminalDeposit.kind,
      "partially_paid",
    );
    nextStep();
    const cancelledOnTerminal = await cancelPaidSaleFor(deps(), {
      saleId: onTerminal.sale.id,
      authorization: { user_id: GRACE, pin: PIN },
    });
    expectOutcome(
      "cancel the sale paid on the standalone terminal authorized by PIN",
      cancelledOnTerminal.kind,
      "cancelled",
    );
    nextStep();
    const onQr = await scanProductFor(deps(), "7790001000011");
    if (onQr.kind !== "added") {
      throw new Error(
        `The register session's "scan a product to pay part by QR" ended as "${onQr.kind}"`,
      );
    }
    nextStep();
    const qrDeposit = await startMercadoPagoChargeFor(
      { ...deps(), orders: APPROVED_QR_ORDERS },
      { saleId: onQr.sale.id, method: "QR", amount: 700 },
    );
    if (qrDeposit.kind !== "order_shown") {
      throw new Error(`The register session's "start the QR deposit" ended as "${qrDeposit.kind}"`);
    }
    nextStep();
    const approvedQr = await followMercadoPagoChargeFor(
      { ...deps(), orders: APPROVED_QR_ORDERS },
      { paymentTransactionId: qrDeposit.payment_transaction_id },
    );
    expectOutcome("follow the QR deposit until it is approved", approvedQr.kind, "partially_paid");
    nextStep();
    const cancelledOnQr = await cancelPaidSaleFor(deps(), {
      saleId: onQr.sale.id,
      authorization: { user_id: GRACE, pin: PIN },
    });
    expectOutcome("cancel the sale paid by QR authorized by PIN", cancelledOnQr.kind, "cancelled");
    nextStep();
    const replacedScan = await scanProductFor(deps(), "7790001000028");
    if (replacedScan.kind !== "added") {
      throw new Error(
        `The register session's "scan a product to pay by QR" ended as "${replacedScan.kind}"`,
      );
    }
    nextStep();
    const qr = await startMercadoPagoChargeFor(
      { ...deps(), orders: OFFLINE_QR_ORDERS },
      { saleId: replacedScan.sale.id, method: "QR", amount: 500 },
    );
    if (qr.kind !== "order_shown") {
      throw new Error(`The register session's "start a QR charge" ended as "${qr.kind}"`);
    }
    nextStep();
    const replaced = await abandonMercadoPagoChargeFor(
      { ...deps(), orders: OFFLINE_QR_ORDERS },
      { paymentTransactionId: qr.payment_transaction_id },
    );
    expectOutcome("abandon the QR charge without reaching the cloud", replaced.kind, "replaced");
    nextStep();
    const replacedCash = await chargeSaleInCashFor(deps(), {
      saleId: replacedScan.sale.id,
      tendered: replacedScan.sale.total,
    });
    expectOutcome("pay in cash beside the replaced QR payment", replacedCash.kind, "completed");
    nextStep();
    const receiptScan = await scanProductFor(deps(), "7790001000028");
    if (receiptScan.kind !== "added") {
      throw new Error(
        `The register session's "scan a product to print" ended as "${receiptScan.kind}"`,
      );
    }
    nextStep();
    const receiptCharge = await chargeSaleInCashFor(deps(), {
      saleId: receiptScan.sale.id,
      tendered: 2400,
    });
    expectOutcome("charge the sale whose receipt is printed", receiptCharge.kind, "completed");
    await printAndReprintReceipt({
      deps: {
        ...deps(),
        signedInUserId: () => signedInPerson.userId(),
        jobs: createReceiptPrintJobs({
          reportFailure: (context, error) => {
            throw new Error(`The register session's receipt print failed: ${context}`, {
              cause: error,
            });
          },
        }),
      },
      saleId: receiptScan.sale.id,
      nextStep,
    });
    holdOfflineAuthorization(database);
    nextStep();
    const offlineScan = await scanProductFor(deps(), "7790001000028");
    if (offlineScan.kind !== "added") {
      throw new Error(
        `The register session's "scan a product to invoice offline" ended as "${offlineScan.kind}"`,
      );
    }
    nextStep();
    const offlineTransfer = await chargeSaleByTransferFor(deps(), {
      saleId: offlineScan.sale.id,
      amount: offlineScan.sale.total,
    });
    expectOutcome(
      "charge a sale invoiced under the pre-obtained code",
      offlineTransfer.kind,
      "completed",
    );
    nextStep();
    const closed = await closeCashSessionFor(deps(), {
      sessionId: opened.cash_session.id,
      countedCash: 12_800,
    });
    expectOutcome("close the cash session", closed.kind, "closed");

    return await use({ database, now });
  } finally {
    database.close();
  }
}

export async function registerSessionPush(): Promise<{
  outboxChainKey: string;
  sentBody: unknown;
}> {
  return withRegisterSession(async ({ database, now }) => {
    const events = await new SqliteLocalOutbox(database, now).unacknowledged(100);
    const lastSeq = events.at(-1)?.device_seq ?? 0;
    const posted: unknown[] = [];
    await new CloudEventInbox({
      post: async (_path, _token, body) => {
        posted.push(body);
        return { kind: "ok", body: { status: "ok", ack_seq: lastSeq } };
      },
      deviceToken: "device-token",
      appVersion: "0.0.0",
      readTelemetry: async () => ({
        wal_size_bytes: 4_120_032,
        disk_free_bytes: 182_536_847_360,
        disk_free_ratio: 0.38,
      }),
    }).push(events);
    if (posted.length !== 1) {
      throw new Error(`The register session posted ${posted.length} pushes, not 1`);
    }
    return { outboxChainKey: OUTBOX_CHAIN_KEY, sentBody: posted[0] };
  });
}
