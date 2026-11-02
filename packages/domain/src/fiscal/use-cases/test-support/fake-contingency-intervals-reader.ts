import type {
  ContingencyIntervalsAtFiscalAddress,
  ContingencyIntervalsQuery,
  ContingencyIntervalsReader,
} from "../contingency-intervals-ports.js";

export class FakeContingencyIntervalsReader implements ContingencyIntervalsReader {
  readonly queries: ContingencyIntervalsQuery[] = [];

  private readonly answer: ContingencyIntervalsAtFiscalAddress;

  constructor(answer: ContingencyIntervalsAtFiscalAddress = { parts: [], registers: [] }) {
    this.answer = answer;
  }

  async contingencyIntervalsAtFiscalAddress(
    query: ContingencyIntervalsQuery,
  ): Promise<ContingencyIntervalsAtFiscalAddress> {
    this.queries.push({ ...query });
    return structuredClone({
      parts: this.answer.parts.filter(
        ({ start, end }) => start < query.to && (end === null || end > query.from),
      ),
      registers: this.answer.registers,
    });
  }
}
