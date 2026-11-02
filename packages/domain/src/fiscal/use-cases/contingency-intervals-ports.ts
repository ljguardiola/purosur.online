import type {
  ContingencyPart,
  ContingencyReportingRegister,
} from "../model/contingency-time-share.js";

export interface ContingencyIntervalsQuery {
  fiscalAddressId: string;
  from: Date;
  to: Date;
}

export interface ContingencyIntervalsAtFiscalAddress {
  parts: ContingencyPart[];
  registers: ContingencyReportingRegister[];
}

export interface ContingencyIntervalsReader {
  contingencyIntervalsAtFiscalAddress(
    query: ContingencyIntervalsQuery,
  ): Promise<ContingencyIntervalsAtFiscalAddress>;
}
