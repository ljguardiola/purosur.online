import type { ExceptionShareYearBody } from "@purosur/contracts";
import type { FiscalAddress } from "../fiscal-addresses-api";

export const centralFiscalAddress: FiscalAddress = {
  id: "fiscal-address-central",
  name: "Local central",
  streetAddress: "Calle Falsa 123",
  version: 1,
};

export const warehouseFiscalAddress: FiscalAddress = {
  id: "fiscal-address-warehouse",
  name: "Depósito norte",
  streetAddress: "Ruta 9 km 12",
  version: 1,
};

export const fiscalAddresses: FiscalAddress[] = [centralFiscalAddress, warehouseFiscalAddress];

const withoutContingencyData: ExceptionShareYearBody["months"][number]["contingency_time"] = {
  contingency_ms: 0,
  available_ms: 0,
  share_tenths_of_percent: null,
  state: "no_data",
};

export const exceptionShareOf2026: ExceptionShareYearBody = {
  fiscal_address: { id: centralFiscalAddress.id, name: centralFiscalAddress.name },
  year: 2026,
  selectable_years: [2026, 2025, 2024],
  non_compliance_percent: 5,
  months: [
    {
      month: "2026-01",
      exception_count: 7,
      total_count: 100,
      share_tenths_of_percent: 70,
      state: "non_compliant",
      contingency_time: withoutContingencyData,
    },
    {
      month: "2026-02",
      exception_count: 1,
      total_count: 50,
      share_tenths_of_percent: 20,
      state: "compliant",
      contingency_time: withoutContingencyData,
    },
    {
      month: "2026-03",
      exception_count: 5,
      total_count: 80,
      share_tenths_of_percent: 62,
      state: "non_compliant",
      contingency_time: withoutContingencyData,
    },
    {
      month: "2026-04",
      exception_count: 2,
      total_count: 40,
      share_tenths_of_percent: 50,
      state: "in_progress",
      contingency_time: withoutContingencyData,
    },
    {
      month: "2026-05",
      exception_count: 0,
      total_count: 0,
      share_tenths_of_percent: null,
      state: "in_progress",
      contingency_time: withoutContingencyData,
    },
  ],
  non_compliant_months: ["2026-01", "2026-03"],
  contingency_non_compliance_percent: 5,
  contingency_non_compliant_months: [],
};

export const exceptionShareOf2026WithoutBreaches: ExceptionShareYearBody = {
  ...exceptionShareOf2026,
  months: exceptionShareOf2026.months.filter(({ state }) => state !== "non_compliant"),
  non_compliant_months: [],
};
