import type {
  AssemblyBatchesQuery,
  AssemblyBatchListReader,
  ReadAssemblyBatch,
} from "../assembly-batch-list-reader.js";

export class FakeAssemblyBatchListReader implements AssemblyBatchListReader {
  private readonly listings: ReadAssemblyBatch[];

  readonly queries: AssemblyBatchesQuery[] = [];

  constructor(listings: ReadAssemblyBatch[] = []) {
    this.listings = listings;
  }

  async batches(query: AssemblyBatchesQuery): Promise<ReadAssemblyBatch[]> {
    this.queries.push(query);
    return this.listings.map((listing) => ({ ...listing }));
  }
}
