import type { PaymentMethod, PointCardType } from "../../payments/index.js";
import type { IssuedDocumentBuyer } from "../model/issued-fiscal-document.js";
import type {
  IssuedFiscalDocument,
  IssuedFiscalDocumentVoucher,
} from "./issued-fiscal-documents-reader.js";

export interface IssuedFiscalDocumentLine {
  productName: string;
  quantity: { kind: "units"; units: number } | { kind: "weight"; grams: number };
  promotion: { name: string } | null;
  amount: number;
}

export interface IssuedFiscalDocumentPayment {
  method: PaymentMethod;
  cardType: PointCardType | null;
  amount: number;
}

export interface IssuedFiscalDocumentDetail extends IssuedFiscalDocument {
  buyer: IssuedDocumentBuyer;
  lines: IssuedFiscalDocumentLine[];
  payments: IssuedFiscalDocumentPayment[];
  creditNotes: IssuedFiscalDocument[];
}

export interface IssuedFiscalDocumentDetailReader {
  issuedDocumentOfBranch(
    locationId: string,
    voucher: IssuedFiscalDocumentVoucher,
  ): Promise<IssuedFiscalDocumentDetail | undefined>;
}
