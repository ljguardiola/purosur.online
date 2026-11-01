import { fetchExceptionShareYear } from "./exception-share-api";
import { fetchFiscalAddresses } from "./fiscal-addresses-api";

export type ExceptionalityScreenServices = {
  fetchFiscalAddresses: typeof fetchFiscalAddresses;
  fetchExceptionShareYear: typeof fetchExceptionShareYear;
};

export const defaultExceptionalityScreenServices: ExceptionalityScreenServices = {
  fetchFiscalAddresses,
  fetchExceptionShareYear,
};
