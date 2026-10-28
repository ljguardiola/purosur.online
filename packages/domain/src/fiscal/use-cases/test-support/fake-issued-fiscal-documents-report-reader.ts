import type { IssuedDocumentGroup } from "../../model/issued-fiscal-documents-report.js";
import type {
  IssuedFiscalDocumentsReportQuery,
  IssuedFiscalDocumentsReportReader,
} from "../issued-fiscal-documents-report-reader.js";

export class FakeIssuedFiscalDocumentsReportReader implements IssuedFiscalDocumentsReportReader {
  readonly reads: IssuedFiscalDocumentsReportQuery[] = [];

  private readonly groups: readonly IssuedDocumentGroup[];

  constructor(groups: readonly IssuedDocumentGroup[] = []) {
    this.groups = groups;
  }

  async issuedGroups(query: IssuedFiscalDocumentsReportQuery): Promise<IssuedDocumentGroup[]> {
    this.reads.push({ ...query, range: { ...query.range } });
    return this.groups.map((each) => ({ ...each }));
  }
}
