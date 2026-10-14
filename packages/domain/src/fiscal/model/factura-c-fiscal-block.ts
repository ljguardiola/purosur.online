import type { Fortnight } from "./offline-authorization-code.js";
import type { FacturaC } from "./pre-emission-gate.js";

export const FACTURA_C_VOUCHER_TYPE = 11;
export const FINAL_CONSUMER_DOCUMENT_TYPE = 99;
export const FINAL_CONSUMER_DOCUMENT_NUMBER = 0;
export const CURRENCY_PESOS = "PES";
export const EXCHANGE_RATE_PESOS = 1;
export const AUTHORIZATION_CODE_TYPE_CAE = "E";
export const AUTHORIZATION_CODE_TYPE_CAEA = "A";
export const TAX_AUTHORITY_QR_URL = "https://www.arca.gob.ar/fe/qr/?p=";

const QR_VERSION = 1;
const CENTS_PER_PESO = 100;

export interface AuthorizedFacturaC {
  pointOfSale: number;
  number: number;
  issuedOn: string;
  document: FacturaC;
  authorizationCode: string;
  authorizationCodeDueOn: string;
}

export interface OfflineAuthorizedFacturaC {
  pointOfSale: number;
  number: number;
  issuedOn: string;
  document: FacturaC;
  offlineAuthorizationCode: string;
  fortnight: Fortnight;
}

export interface OfflineFacturaCFiscalBlock {
  invoiceClass: "C";
  voucherTypeCode: number;
  issuer: FacturaCFiscalBlock["issuer"];
  buyerTaxStatusDescription: string;
  pointOfSale: number;
  number: number;
  authorizationCode: string;
  fortnight: Fortnight;
  qrText: string;
}

export interface FacturaCFiscalBlock {
  invoiceClass: "C";
  voucherTypeCode: number;
  issuer: {
    legalName: string;
    cuit: string;
    taxStatus: string;
    grossIncomeRegistration: string;
    activityStartDate: string;
  };
  buyerTaxStatusDescription: string;
  pointOfSale: number;
  number: number;
  authorizationCode: string;
  authorizationCodeDueOn: string;
  qrText: string;
}

interface QrSource {
  pointOfSale: number;
  number: number;
  issuedOn: string;
  document: FacturaC;
}

function qrText(
  { pointOfSale, number, issuedOn, document }: QrSource,
  authorizationCodeType: string,
  authorizationCode: string,
): string {
  const payload = {
    ver: QR_VERSION,
    fecha: issuedOn,
    cuit: Number(document.issuer.cuit.replaceAll("-", "")),
    ptoVta: pointOfSale,
    tipoCmp: FACTURA_C_VOUCHER_TYPE,
    nroCmp: number,
    importe: document.total / CENTS_PER_PESO,
    moneda: CURRENCY_PESOS,
    ctz: EXCHANGE_RATE_PESOS,
    tipoDocRec: FINAL_CONSUMER_DOCUMENT_TYPE,
    nroDocRec: FINAL_CONSUMER_DOCUMENT_NUMBER,
    tipoCodAut: authorizationCodeType,
    codAut: Number(authorizationCode),
  };
  return `${TAX_AUTHORITY_QR_URL}${btoa(JSON.stringify(payload))}`;
}

export function facturaCFiscalBlock(authorized: AuthorizedFacturaC): FacturaCFiscalBlock {
  const { document } = authorized;
  const { legalName, cuit, taxStatus, grossIncomeRegistration, activityStartDate } =
    document.issuer;
  return {
    invoiceClass: "C",
    voucherTypeCode: FACTURA_C_VOUCHER_TYPE,
    issuer: { legalName, cuit, taxStatus, grossIncomeRegistration, activityStartDate },
    buyerTaxStatusDescription: document.buyerTaxStatusDescription,
    pointOfSale: authorized.pointOfSale,
    number: authorized.number,
    authorizationCode: authorized.authorizationCode,
    authorizationCodeDueOn: authorized.authorizationCodeDueOn,
    qrText: qrText(authorized, AUTHORIZATION_CODE_TYPE_CAE, authorized.authorizationCode),
  };
}

export function offlineFacturaCFiscalBlock(
  authorized: OfflineAuthorizedFacturaC,
): OfflineFacturaCFiscalBlock {
  const { document } = authorized;
  const { legalName, cuit, taxStatus, grossIncomeRegistration, activityStartDate } =
    document.issuer;
  return {
    invoiceClass: "C",
    voucherTypeCode: FACTURA_C_VOUCHER_TYPE,
    issuer: { legalName, cuit, taxStatus, grossIncomeRegistration, activityStartDate },
    buyerTaxStatusDescription: document.buyerTaxStatusDescription,
    pointOfSale: authorized.pointOfSale,
    number: authorized.number,
    authorizationCode: authorized.offlineAuthorizationCode,
    fortnight: authorized.fortnight,
    qrText: qrText(authorized, AUTHORIZATION_CODE_TYPE_CAEA, authorized.offlineAuthorizationCode),
  };
}
