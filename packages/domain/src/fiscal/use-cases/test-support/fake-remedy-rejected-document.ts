import type { FiscalDocumentType } from "../../model/fiscal-rejection-standing.js";
import type { Fortnight } from "../../model/offline-authorization-code.js";
import type {
  FortnightReportKey,
  OfflineDocumentOfFortnight,
  RecordedDocumentTypeReport,
} from "../fortnight-report-ports.js";
import type {
  RejectedDocumentRemedyAudit,
  RejectedDocumentRemedyRecord,
  RemedyRejectedDocumentStore,
  RemedyRejectedDocumentStoreTransaction,
} from "../remedy-rejected-document-ports.js";

type WriteOperation = "recordRemedy" | "recordRemedyAudit";

interface FakeRemedyState {
  remedies: RejectedDocumentRemedyRecord[];
  audits: RejectedDocumentRemedyAudit[];
}

function keyOf({ pointOfSaleNumber, fortnight }: FortnightReportKey): string {
  return `${pointOfSaleNumber}:${fortnight.start}`;
}

export class FakeRemedyRejectedDocumentStore implements RemedyRejectedDocumentStore {
  readonly operationOrder: string[] = [];
  readonly heldPresentations: FortnightReportKey[] = [];
  readonly failingWrites = new Set<WriteOperation>();
  transactionCount = 0;
  private state: FakeRemedyState = { remedies: [], audits: [] };
  private readonly typeReports = new Map<string, RecordedDocumentTypeReport>();
  private readonly documents = new Map<string, OfflineDocumentOfFortnight[]>();

  seedDocumentTypeReport(key: FortnightReportKey, report: RecordedDocumentTypeReport): void {
    this.typeReports.set(`${keyOf(key)}:${report.documentType}`, report);
  }

  seedDocuments(
    pointOfSaleNumber: number,
    fortnight: Fortnight,
    documents: OfflineDocumentOfFortnight[],
  ): void {
    this.documents.set(keyOf({ pointOfSaleNumber, fortnight }), documents);
  }

  snapshot(): FakeRemedyState {
    return structuredClone(this.state);
  }

  async transaction<TOutcome>(
    work: (tx: RemedyRejectedDocumentStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    this.transactionCount += 1;
    const before = structuredClone(this.state);
    try {
      return await work(this.transactionOver());
    } catch (error) {
      this.state = before;
      throw error;
    }
  }

  private transactionOver(): RemedyRejectedDocumentStoreTransaction {
    const order = this.operationOrder;
    const write = (operation: WriteOperation) => {
      order.push(operation);
      if (this.failingWrites.has(operation)) {
        throw new Error(`${operation} failed`);
      }
    };
    return {
      holdFortnightPresentation: async (key) => {
        order.push("holdFortnightPresentation");
        this.heldPresentations.push(key);
      },
      documentTypeReport: async (key: FortnightReportKey, documentType: FiscalDocumentType) => {
        order.push("documentTypeReport");
        return this.typeReports.get(`${keyOf(key)}:${documentType}`) ?? null;
      },
      documentsOn: async (pointOfSaleNumber, fortnight) => {
        order.push("documentsOn");
        return this.documents.get(keyOf({ pointOfSaleNumber, fortnight })) ?? [];
      },
      recordRemedy: async (record) => {
        write("recordRemedy");
        this.state.remedies.push(structuredClone(record));
      },
      recordRemedyAudit: async (audit) => {
        write("recordRemedyAudit");
        this.state.audits.push(structuredClone(audit));
      },
    };
  }
}
