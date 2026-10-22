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

export const DEFAULT_LOCATION_ID = "location-1";

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
  private readonly branchOfPointOfSale = new Map<number, string>();

  seedDocumentTypeReport(
    key: FortnightReportKey,
    report: RecordedDocumentTypeReport,
    locationId = DEFAULT_LOCATION_ID,
  ): void {
    this.branchOfPointOfSale.set(key.pointOfSaleNumber, locationId);
    this.typeReports.set(`${keyOf(key)}:${report.documentType}`, report);
  }

  seedDocuments(
    pointOfSaleNumber: number,
    fortnight: Fortnight,
    documents: OfflineDocumentOfFortnight[],
    locationId = DEFAULT_LOCATION_ID,
  ): void {
    this.branchOfPointOfSale.set(pointOfSaleNumber, locationId);
    this.documents.set(keyOf({ pointOfSaleNumber, fortnight }), documents);
  }

  private isOfBranch(pointOfSaleNumber: number, locationId: string): boolean {
    return this.branchOfPointOfSale.get(pointOfSaleNumber) === locationId;
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
      documentTypeReport: async (
        key: FortnightReportKey,
        documentType: FiscalDocumentType,
        locationId: string,
      ) => {
        order.push("documentTypeReport");
        return this.isOfBranch(key.pointOfSaleNumber, locationId)
          ? (this.typeReports.get(`${keyOf(key)}:${documentType}`) ?? null)
          : null;
      },
      documentsOn: async (pointOfSaleNumber, fortnight, locationId) => {
        order.push("documentsOn");
        return this.isOfBranch(pointOfSaleNumber, locationId)
          ? (this.documents.get(keyOf({ pointOfSaleNumber, fortnight })) ?? [])
          : [];
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
