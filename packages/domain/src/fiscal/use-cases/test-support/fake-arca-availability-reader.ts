import type { ArcaAvailabilityRun } from "../../model/contingency-time-share.js";
import type {
  ArcaAvailabilityQuery,
  ArcaAvailabilityReader,
} from "../read-exception-share-year-ports.js";

export class FakeArcaAvailabilityReader implements ArcaAvailabilityReader {
  readonly queries: ArcaAvailabilityQuery[] = [];

  private readonly runs: readonly ArcaAvailabilityRun[];

  constructor(runs: readonly ArcaAvailabilityRun[] = []) {
    this.runs = runs;
  }

  async availabilityRuns(query: ArcaAvailabilityQuery): Promise<ArcaAvailabilityRun[]> {
    this.queries.push({ ...query });
    return structuredClone(
      this.runs.filter(
        ({ firstCheckedAt, lastCheckedAt }) =>
          firstCheckedAt < query.to && lastCheckedAt >= query.from,
      ),
    );
  }
}
