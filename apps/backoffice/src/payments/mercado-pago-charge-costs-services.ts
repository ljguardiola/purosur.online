import { fetchMercadoPagoChargeCosts } from "./mercado-pago-charge-costs-api";

export type MercadoPagoChargeCostsScreenServices = {
  fetchMercadoPagoChargeCosts: typeof fetchMercadoPagoChargeCosts;
};

export const defaultMercadoPagoChargeCostsScreenServices: MercadoPagoChargeCostsScreenServices = {
  fetchMercadoPagoChargeCosts,
};
