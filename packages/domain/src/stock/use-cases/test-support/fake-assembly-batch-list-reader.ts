import type {
  AssemblyBatchesQuery,
  AssemblyBatchListing,
  AssemblyBatchListReader,
} from "../assembly-batch-list-reader.js";

export class FakeAssemblyBatchListReader implements AssemblyBatchListReader {
  private readonly listings: AssemblyBatchListing[];

  readonly queries: AssemblyBatchesQuery[] = [];

  constructor(listings: AssemblyBatchListing[] = []) {
    this.listings = listings;
  }

  async batches(query: AssemblyBatchesQuery): Promise<AssemblyBatchListing[]> {
    this.queries.push(query);
    return this.listings.map((listing) => ({ ...listing }));
  }
}
