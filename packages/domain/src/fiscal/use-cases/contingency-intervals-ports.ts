export interface ContingencyIntervalsQuery {
  fiscalAddressId: string;
  from: Date;
  to: Date;
}

export interface RegisterContingencyPart {
  registerId: string;
  start: Date;
  end: Date | null;
}

export interface RegisterContingencyReporting {
  registerId: string;
  reportingSince: Date | null;
}

export interface ContingencyIntervalsAtFiscalAddress {
  parts: RegisterContingencyPart[];
  registers: RegisterContingencyReporting[];
}

export interface ContingencyIntervalsReader {
  contingencyIntervalsAtFiscalAddress(
    query: ContingencyIntervalsQuery,
  ): Promise<ContingencyIntervalsAtFiscalAddress>;
}
