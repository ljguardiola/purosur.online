export interface ContingencyEnteredFact {
  intervalId: string;
  startedAt: Date;
}

export interface ContingencyLeftFact {
  intervalId: string;
  startedAt: Date;
  endedAt: Date;
}

export interface ContingencyReportingStartedFact {
  since: Date;
  fromEnrollment: boolean;
}
