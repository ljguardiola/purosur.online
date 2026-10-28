import { randomUUID } from "node:crypto";
import { FICTIONAL_CUIT } from "@purosur/domain/fiscal/test-support";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { insertLocation } from "../stock/test-support/stock-route-fixtures.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleIssuedFiscalDocumentDetailReader } from "./drizzle-issued-fiscal-document-detail-reader.js";
import {
  insertCaeaDocument,
  insertCompletedSale,
  insertOnlineCreditNote,
  insertPromotion,
  insertReceiptRequest,
  insertRegisterOf,
  insertSalePayment,
  insertSoldLine,
} from "./test-support/issued-document-fixtures.js";

const NOW = new Date("2026-10-07T15:00:00.000Z");
const RECEIPT = { voucherType: 11, pointOfSale: 7, number: 12 };
const CREDIT_NOTE = { voucherType: 13, pointOfSale: 7, number: 3 };
const FICTIONAL_CUIT_NUMBER = Number(FICTIONAL_CUIT.replaceAll("-", ""));

let testDatabase: TestDatabase;
let db: TestDatabase["db"];

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
});

async function aBranchWithRegister(name = "Caja 1") {
  const { registerId, locationId, deviceId } = await insertEnrolledInstallation(db, {
    now: NOW,
    registerName: name,
  });
  return { registerId, locationId, deviceId };
}

async function aSale(registerId: string, deviceId: string) {
  const saleId = randomUUID();
  await insertCompletedSale(db, { saleId, registerId, deviceId, at: NOW });
  return saleId;
}

function detailOf(locationId: string, voucher: typeof RECEIPT) {
  return new DrizzleIssuedFiscalDocumentDetailReader(db).issuedDocumentOfBranch(
    locationId,
    voucher,
  );
}

describe("DrizzleIssuedFiscalDocumentDetailReader.issuedDocumentOfBranch", () => {
  describe("a receipt requested online", () => {
    it("reads its document, its buyer as the final consumer and its authorization", async () => {
      const { registerId, locationId, deviceId } = await aBranchWithRegister("Caja 1");
      await insertReceiptRequest(db, registerId, {
        ...RECEIPT,
        saleId: await aSale(registerId, deviceId),
        issuedOn: "2026-10-05",
        total: 4_800,
        authorizationCode: "75123456789012",
        authorizationCodeDueOn: "2026-10-15",
      });

      const detail = await detailOf(locationId, RECEIPT);

      expect(detail).toMatchObject({
        kind: "receipt",
        ...RECEIPT,
        issuedOn: "2026-10-05",
        register: { id: registerId, name: "Caja 1" },
        authorization: { kind: "cae", code: "75123456789012", dueOn: "2026-10-15" },
        state: "authorized",
        total: 4_800,
        buyer: { kind: "final_consumer" },
        correctedVoucher: null,
      });
    });

    it("reads the lines as sold: by unit, by weight and with the promotion applied", async () => {
      const { registerId, locationId, deviceId } = await aBranchWithRegister();
      const saleId = await aSale(registerId, deviceId);
      await insertReceiptRequest(db, registerId, { ...RECEIPT, saleId });
      const promotionId = await insertPromotion(db, "Lácteos 2x1");
      await insertSoldLine(db, saleId, {
        productName: "Yerba 1 kg",
        quantity: 2,
        lineTotal: 3_000,
      });
      await insertSoldLine(db, saleId, {
        productName: "Queso cremoso",
        quantity: 450,
        weightSource: "SCALE",
        promotionId,
        discountAmount: 200,
        lineTotal: 1_800,
      });

      const detail = await detailOf(locationId, RECEIPT);

      expect(detail?.lines).toHaveLength(2);
      expect(detail?.lines).toContainEqual({
        productName: "Yerba 1 kg",
        saleUnit: "UNIT",
        quantity: 2,
        promotion: null,
        amount: 3_000,
      });
      expect(detail?.lines).toContainEqual({
        productName: "Queso cremoso",
        saleUnit: "KG",
        quantity: 450,
        promotion: { name: "Lácteos 2x1" },
        amount: 1_800,
      });
    });

    it("reads a weight typed by hand as sold by weight too", async () => {
      const { registerId, locationId, deviceId } = await aBranchWithRegister();
      const saleId = await aSale(registerId, deviceId);
      await insertReceiptRequest(db, registerId, { ...RECEIPT, saleId });
      await insertSoldLine(db, saleId, { quantity: 250, weightSource: "MANUAL" });

      const detail = await detailOf(locationId, RECEIPT);

      expect(detail?.lines.map(({ saleUnit, quantity }) => ({ saleUnit, quantity }))).toEqual([
        { saleUnit: "KG", quantity: 250 },
      ]);
    });

    it("reads only the approved payments, with their method and card type", async () => {
      const { registerId, locationId, deviceId } = await aBranchWithRegister();
      const saleId = await aSale(registerId, deviceId);
      await insertReceiptRequest(db, registerId, { ...RECEIPT, saleId });
      await insertSalePayment(db, saleId, { method: "CASH", amount: 3_800 });
      await insertSalePayment(db, saleId, {
        method: "POINT",
        provider: "MERCADOPAGO_POINT",
        cardType: "DEBIT",
        amount: 1_000,
      });
      await insertSalePayment(db, saleId, {
        method: "QR",
        provider: "MERCADOPAGO_QR",
        state: "REJECTED",
      });

      const detail = await detailOf(locationId, RECEIPT);

      expect(detail?.payments).toHaveLength(2);
      expect(detail?.payments).toContainEqual({ method: "CASH", cardType: null, amount: 3_800 });
      expect(detail?.payments).toContainEqual({
        method: "POINT",
        cardType: "DEBIT",
        amount: 1_000,
      });
    });

    it("refuses to read a payment whose method is not one the cloud knows", async () => {
      const { registerId, locationId, deviceId } = await aBranchWithRegister();
      const saleId = await aSale(registerId, deviceId);
      await insertReceiptRequest(db, registerId, { ...RECEIPT, saleId });
      await insertSalePayment(db, saleId, { method: "CHEQUE" });

      await expect(detailOf(locationId, RECEIPT)).rejects.toThrow("CHEQUE");
    });

    it("reads a document still awaited, without lines or payments of a sale that has none", async () => {
      const { registerId, locationId } = await aBranchWithRegister();
      await insertReceiptRequest(db, registerId, {
        ...RECEIPT,
        answerKind: null,
        answeredAt: null,
        authorizationCode: null,
        authorizationCodeDueOn: null,
      });

      const detail = await detailOf(locationId, RECEIPT);

      expect(detail).toMatchObject({ state: "awaiting_authorization", authorization: null });
      expect(detail).toMatchObject({ lines: [], payments: [], creditNotes: [] });
    });
  });

  describe("a receipt issued offline", () => {
    it("reads the CAEA and the buyer stored with the document", async () => {
      const { registerId, locationId } = await aBranchWithRegister();
      await insertCaeaDocument(db, registerId, {
        pointOfSale: 8,
        number: 5,
        offlineAuthorizationCode: "21403471111111",
        buyerDocumentType: 96,
        buyerDocumentNumber: 12_345_678,
      });

      const detail = await detailOf(locationId, { voucherType: 11, pointOfSale: 8, number: 5 });

      expect(detail).toMatchObject({
        contingency: true,
        authorization: { kind: "caea", code: "21403471111111" },
        buyer: { kind: "identified", documentKind: "dni", documentNumber: 12_345_678 },
      });
    });

    it("reads a buyer identified with a CUIT, which does not fit in 32 bits", async () => {
      const { registerId, locationId } = await aBranchWithRegister();
      await insertCaeaDocument(db, registerId, {
        pointOfSale: 8,
        number: 5,
        buyerDocumentType: 80,
        buyerDocumentNumber: FICTIONAL_CUIT_NUMBER,
      });

      const detail = await detailOf(locationId, { voucherType: 11, pointOfSale: 8, number: 5 });

      expect(detail?.buyer).toEqual({
        kind: "identified",
        documentKind: "cuit",
        documentNumber: FICTIONAL_CUIT_NUMBER,
      });
    });

    it("reads the final consumer stored with the document as the final consumer", async () => {
      const { registerId, locationId } = await aBranchWithRegister();
      await insertCaeaDocument(db, registerId, { pointOfSale: 8, number: 5 });

      const detail = await detailOf(locationId, { voucherType: 11, pointOfSale: 8, number: 5 });

      expect(detail?.buyer).toEqual({ kind: "final_consumer" });
    });
  });

  describe("the credit notes of a receipt", () => {
    it("lists the credit notes issued against it, oldest first", async () => {
      const { registerId, locationId } = await aBranchWithRegister();
      await insertReceiptRequest(db, registerId, RECEIPT);
      await insertOnlineCreditNote(db, registerId, {
        number: 4,
        associatedNumber: RECEIPT.number,
        requestedAt: new Date("2026-10-06T10:00:00.000Z"),
        total: 1_000,
      });
      await insertOnlineCreditNote(db, registerId, {
        number: 3,
        associatedNumber: RECEIPT.number,
        requestedAt: new Date("2026-10-05T14:00:00.000Z"),
        total: 2_000,
      });

      const detail = await detailOf(locationId, RECEIPT);

      expect(
        detail?.creditNotes.map(({ kind, voucherType, number, total }) => ({
          kind,
          voucherType,
          number,
          total,
        })),
      ).toEqual([
        { kind: "credit_note", voucherType: 13, number: 3, total: 2_000 },
        { kind: "credit_note", voucherType: 13, number: 4, total: 1_000 },
      ]);
      expect(detail?.creditNotes[0]?.correctedVoucher).toEqual(RECEIPT);
    });

    it("lists an offline credit note issued against it", async () => {
      const { registerId, locationId } = await aBranchWithRegister();
      await insertReceiptRequest(db, registerId, RECEIPT);
      await insertCaeaDocument(db, registerId, {
        documentType: "credit_note_c",
        creditNoteId: randomUUID(),
        pointOfSale: 8,
        number: 9,
        correctedVoucherType: 11,
        correctedPointOfSale: RECEIPT.pointOfSale,
        correctedNumber: RECEIPT.number,
      });

      const detail = await detailOf(locationId, RECEIPT);

      expect(detail?.creditNotes).toMatchObject([
        { kind: "credit_note", pointOfSale: 8, number: 9, contingency: true },
      ]);
    });

    it("does not list the credit notes of another receipt", async () => {
      const { registerId, locationId } = await aBranchWithRegister();
      await insertReceiptRequest(db, registerId, RECEIPT);
      await insertOnlineCreditNote(db, registerId, { number: 3, associatedNumber: 99 });
      await insertOnlineCreditNote(db, registerId, {
        number: 4,
        associatedNumber: RECEIPT.number,
        associatedPointOfSale: 8,
      });
      await insertOnlineCreditNote(db, registerId, {
        number: 5,
        associatedNumber: RECEIPT.number,
        associatedVoucherType: 1,
      });

      const detail = await detailOf(locationId, RECEIPT);

      expect(detail?.creditNotes).toEqual([]);
    });

    it("does not list a credit note still without a number or one of another branch", async () => {
      const { registerId, locationId } = await aBranchWithRegister();
      const otherRegister = await insertRegisterOf(db, await insertLocation(db), "Caja 9");
      await insertReceiptRequest(db, registerId, RECEIPT);
      await insertOnlineCreditNote(db, registerId, {
        number: null,
        issuedOn: null,
        requestedAt: null,
        answerKind: null,
        answeredAt: null,
        authorizationCode: null,
        authorizationCodeDueOn: null,
        associatedNumber: RECEIPT.number,
      });
      await insertOnlineCreditNote(db, otherRegister, {
        number: 6,
        associatedNumber: RECEIPT.number,
      });

      const detail = await detailOf(locationId, RECEIPT);

      expect(detail?.creditNotes).toEqual([]);
    });
  });

  describe("a credit note", () => {
    it("reads the voucher it corrects and the sale it was issued for, with no credit notes of its own", async () => {
      const { registerId, locationId, deviceId } = await aBranchWithRegister();
      const saleId = await aSale(registerId, deviceId);
      await insertSoldLine(db, saleId, {
        productName: "Yerba 1 kg",
        quantity: 1,
        lineTotal: 1_500,
      });
      await insertSalePayment(db, saleId, { amount: 1_500 });
      await insertOnlineCreditNote(db, registerId, {
        pointOfSale: CREDIT_NOTE.pointOfSale,
        number: CREDIT_NOTE.number,
        saleId,
        associatedVoucherType: 11,
        associatedPointOfSale: RECEIPT.pointOfSale,
        associatedNumber: RECEIPT.number,
        total: 1_500,
      });

      const detail = await detailOf(locationId, CREDIT_NOTE);

      expect(detail).toMatchObject({
        kind: "credit_note",
        ...CREDIT_NOTE,
        total: 1_500,
        correctedVoucher: RECEIPT,
        buyer: { kind: "final_consumer" },
        creditNotes: [],
      });
      expect(detail?.lines).toHaveLength(1);
      expect(detail?.payments).toEqual([{ method: "CASH", cardType: null, amount: 1_500 }]);
    });
  });

  describe("what is not found", () => {
    it("does not find a document of another branch", async () => {
      const { locationId } = await aBranchWithRegister();
      const otherLocation = await insertLocation(db);
      const otherRegister = await insertRegisterOf(db, otherLocation, "Caja 9");
      await insertReceiptRequest(db, otherRegister, RECEIPT);

      expect(await detailOf(locationId, RECEIPT)).toBeUndefined();
      expect(await detailOf(otherLocation, RECEIPT)).toMatchObject({ number: RECEIPT.number });
    });

    it("does not find a voucher that was never issued", async () => {
      const { registerId, locationId } = await aBranchWithRegister();
      await insertReceiptRequest(db, registerId, RECEIPT);

      expect(await detailOf(locationId, { ...RECEIPT, number: 13 })).toBeUndefined();
      expect(await detailOf(locationId, { ...RECEIPT, pointOfSale: 8 })).toBeUndefined();
      expect(await detailOf(locationId, { ...RECEIPT, voucherType: 13 })).toBeUndefined();
    });

    it("does not find a receipt whose request was answered with a state that is not listed", async () => {
      const { registerId, locationId } = await aBranchWithRegister();
      await insertReceiptRequest(db, registerId, {
        ...RECEIPT,
        answerKind: "rejected",
        rejectionCodes: [10015],
        rejectionClass: "content",
        authorizationCode: null,
        authorizationCodeDueOn: null,
      });

      expect(await detailOf(locationId, RECEIPT)).toBeUndefined();
    });
  });
});
