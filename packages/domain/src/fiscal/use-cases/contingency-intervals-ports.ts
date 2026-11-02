import type {
  ContingencyPart,
  ContingencyReportingRegister,
} from "../model/contingency-time-share.js";

export interface ContingencyIntervalsQuery {
  fiscalAddressId: string;
  from: Date;
  to: Date;
}

export type RegisterContingencyPart = ContingencyPart;

export type RegisterContingencyReporting = ContingencyReportingRegister;

export interface ContingencyIntervalsAtFiscalAddress {
  parts: RegisterContingencyPart[];
  registers: RegisterContingencyReporting[];
}

export interface ContingencyIntervalsReader {
  contingencyIntervalsAtFiscalAddress(
    query: ContingencyIntervalsQuery,
  ): Promise<ContingencyIntervalsAtFiscalAddress>;
}
