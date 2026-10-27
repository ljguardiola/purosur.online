import type {
  IssuedFiscalDocument,
  IssuedFiscalDocumentsPage,
  IssuedFiscalDocumentsQuery,
  IssuedFiscalDocumentsReader,
} from "../issued-fiscal-documents-reader.js";

export class FakeIssuedFiscalDocumentsReader implements IssuedFiscalDocumentsReader {
  readonly issuedInPeriodReads: IssuedFiscalDocumentsQuery[] = [];
  private readonly documents: IssuedFiscalDocument[];

  constructor(documents: IssuedFiscalDocument[] = []) {
    this.documents = documents;
  }

  async issuedInPeriod(query: IssuedFiscalDocumentsQuery): Promise<IssuedFiscalDocumentsPage> {
    this.issuedInPeriodReads.push({ ...query, range: { ...query.range }, page: { ...query.page } });
    const matching = this.documents.filter(
      (document) => document.issuedOn >= query.range.from && document.issuedOn <= query.range.to,
    );
    const start = (query.page.number - 1) * query.page.size;
    return {
      documents: matching.slice(start, start + query.page.size),
      total: matching.length,
    };
  }
}
