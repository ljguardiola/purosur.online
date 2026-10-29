import { fetchCashMovements } from "./cash-movements-api";

export type CashMovementsScreenServices = {
  fetchCashMovements: typeof fetchCashMovements;
};

export const defaultCashMovementsScreenServices: CashMovementsScreenServices = {
  fetchCashMovements,
};
