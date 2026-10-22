import type { NumberingFreeze } from "../../model/numbering-conflict.js";
import type {
  OrphanRegularization,
  RequestsAtNumber,
  SaleDocument,
} from "../../model/orphan-authorization.js";
import type { AuthorizationNumber } from "../orphan-authorization-ports.js";
import type {
  RegisterFiscalPointsOfSale,
  RestoredRegisterOrphanLane,
  RestoredRegisterOrphanLanes,
  UnrecordedSaleRequest,
} from "../sweep-restored-register-orphan-authorizations-ports.js";

export class FakeRestoredRegisterOrphanSweep
  implements RestoredRegisterOrphanLanes, RegisterFiscalPointsOfSale
{
  readonly operations: string[] = [];
  readonly regularizations: OrphanRegularization[] = [];
  private readonly points = new Map<string, number[]>();
  private readonly freezes = new Map<number, NumberingFreeze>();
  private readonly unrecorded = new Map<number, UnrecordedSaleRequest[]>();
  private readonly atNumber = new Map<string, RequestsAtNumber>();
  private readonly saleDocuments = new Map<string, SaleDocument[]>();

  seedPointsOfSale(registerId: string, pointsOfSale: number[]) {
    this.points.set(registerId, pointsOfSale);
  }

  seedFreeze(pointOfSale: number, freeze: NumberingFreeze) {
    this.freezes.set(pointOfSale, freeze);
  }

  seedUnrecordedRequests(pointOfSale: number, requests: UnrecordedSaleRequest[]) {
    this.unrecorded.set(pointOfSale, requests);
  }

  seedRequestsAtNumber({ pointOfSale, number }: AuthorizationNumber, requests: RequestsAtNumber) {
    this.atNumber.set(`/`, requests);
  }

  seedSaleDocuments(saleId: string, documents: SaleDocument[]) {
    this.saleDocuments.set(saleId, documents);
  }

  async fiscalPointsOfSaleOf(registerId: string): Promise<number[]> {
    this.operations.push("fiscalPointsOfSaleOf");
    return this.points.get(registerId) ?? [];
  }

  async inPointOfSaleLane<TOutcome>(
    pointOfSale: number,
    work: (lane: RestoredRegisterOrphanLane) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    this.operations.push(`enterLane:`);
    try {
      return await work(this.laneOf(pointOfSale));
    } finally {
      this.operations.push(`leaveLane:`);
    }
  }

  private laneOf(pointOfSale: number): RestoredRegisterOrphanLane {
    return {
      numberingFreeze: async () => {
        this.operations.push("numberingFreeze");
        return this.freezes.get(pointOfSale) ?? null;
      },
      requestsWithoutRecordedSale: async () => {
        this.operations.push("requestsWithoutRecordedSale");
        return this.unrecorded.get(pointOfSale) ?? [];
      },
      requestsAtNumber: async ({ number }) => {
        this.operations.push("requestsAtNumber");
        return (
          this.atNumber.get(`/`) ?? { kind: "requests", requests: [] }
        );
      },
      otherDocumentsOfSale: async (saleId) => {
        this.operations.push("otherDocumentsOfSale");
        return this.saleDocuments.get(saleId) ?? [];
      },
      recordOrphanRegularization: async (regularization) => {
        this.operations.push("recordOrphanRegularization");
        this.regularizations.push(regularization);
      },
    };
  }
}
