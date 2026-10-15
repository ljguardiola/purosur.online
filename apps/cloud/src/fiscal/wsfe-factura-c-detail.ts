import { CURRENCY_PESOS, EXCHANGE_RATE_PESOS } from "@purosur/domain";

const PRODUCTS = 1;
const CENTS_PER_PESO = 100;

export interface FacturaCDetailSource {
  number: number;
  issuedOn: string;
  total: number;
  netAmount: number;
  buyerDocumentType: number;
  buyerDocumentNumber: number;
  buyerTaxStatusCode: number;
}

function yyyymmdd(isoDate: string): string {
  return isoDate.replaceAll("-", "");
}

function pesosOf(cents: number): string {
  return (cents / CENTS_PER_PESO).toFixed(2);
}

export function facturaCDetail({
  number,
  issuedOn,
  total,
  netAmount,
  buyerDocumentType,
  buyerDocumentNumber,
  buyerTaxStatusCode,
}: FacturaCDetailSource) {
  return {
    Concepto: PRODUCTS,
    DocTipo: buyerDocumentType,
    DocNro: buyerDocumentNumber,
    CbteDesde: number,
    CbteHasta: number,
    CbteFch: yyyymmdd(issuedOn),
    ImpTotal: pesosOf(total),
    ImpTotConc: 0,
    ImpNeto: pesosOf(netAmount),
    ImpOpEx: 0,
    ImpTrib: 0,
    ImpIVA: 0,
    MonId: CURRENCY_PESOS,
    MonCotiz: EXCHANGE_RATE_PESOS,
    CondicionIVAReceptorId: buyerTaxStatusCode,
  };
}
