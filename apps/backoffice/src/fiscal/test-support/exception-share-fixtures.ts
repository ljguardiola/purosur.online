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

export const withoutContingencyData: ExceptionShareYearBody["months"][number]["contingency_time"] =
  {
    contingency_ms: 0,
    available_ms: 0,
    share_tenths_of_percent: null,
    state: "no_data",
  };

type ContingencyTime = ExceptionShareYearBody["months"][number]["contingency_time"];

const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;

const nonCompliantContingencyTime: ContingencyTime = {
  contingency_ms: 3 * HOUR_MS + 25 * MINUTE_MS,
  available_ms: 40 * HOUR_MS,
  share_tenths_of_percent: 85,
  state: "non_compliant",
};

const compliantContingencyTime: ContingencyTime = {
  contingency_ms: 45 * MINUTE_MS,
  available_ms: 672 * HOUR_MS,
  share_tenths_of_percent: 1,
  state: "compliant",
};

const inProgressContingencyTime: ContingencyTime = {
  contingency_ms: 2 * HOUR_MS,
  available_ms: 100 * HOUR_MS,
  share_tenths_of_percent: 20,
  state: "in_progress",
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
      contingency_time: nonCompliantContingencyTime,
    },
    {
      month: "2026-02",
      exception_count: 1,
      total_count: 50,
      share_tenths_of_percent: 20,
      state: "compliant",
      contingency_time: compliantContingencyTime,
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
      contingency_time: inProgressContingencyTime,
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
  contingency_non_compliant_months: ["2026-01"],
};

export const exceptionShareOf2026WithoutBreaches: ExceptionShareYearBody = {
  ...exceptionShareOf2026,
  months: exceptionShareOf2026.months.filter(({ state }) => state !== "non_compliant"),
  non_compliant_months: [],
  contingency_non_compliant_months: [],
};
