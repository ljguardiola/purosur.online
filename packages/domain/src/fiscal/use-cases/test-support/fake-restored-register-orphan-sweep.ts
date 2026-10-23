import { FACTURA_C_VOUCHER_TYPE } from "../../model/factura-c-fiscal-block.js";
import type { NumberingFreeze } from "../../model/numbering-conflict.js";
import {
  creditNotesDecidedFor,
  type OrphanRegularization,
  type RequestsAtNumber,
  type SaleCreditNote,
  type SaleDocument,
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
  private readonly creditNotes = new Map<string, SaleCreditNote[]>();

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
    this.atNumber.set(`${pointOfSale}/${number}`, requests);
  }

  seedSaleDocuments(saleId: string, documents: SaleDocument[]) {
    this.saleDocuments.set(saleId, documents);
  }

  seedCreditNotes(saleId: string, creditNotes: SaleCreditNote[]) {
    this.creditNotes.set(saleId, creditNotes);
  }

  private requestsOfSale(saleId: string, excludedFiscalDocumentId: string): SaleDocument[] {
    return [...this.unrecorded].flatMap(([pointOfSale, requests]) =>
      requests
        .filter(
          (request) =>
            request.saleId === saleId && request.fiscalDocumentId !== excludedFiscalDocumentId,
        )
        .map(
          (request): SaleDocument => ({
            kind: "real_time",
            voucher: { voucherType: FACTURA_C_VOUCHER_TYPE, pointOfSale, number: request.number },
            outcome: request.outcome,
          }),
        ),
    );
  }

  async fiscalPointsOfSaleOf(registerId: string): Promise<number[]> {
    this.operations.push("fiscalPointsOfSaleOf");
    return this.points.get(registerId) ?? [];
  }

  async inPointOfSaleLane<TOutcome>(
    pointOfSale: number,
    work: (lane: RestoredRegisterOrphanLane) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    this.operations.push(`enterLane:${pointOfSale}`);
    try {
      return await work(this.laneOf(pointOfSale));
    } finally {
      this.operations.push(`leaveLane:${pointOfSale}`);
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
        return this.atNumber.get(`${pointOfSale}/${number}`) ?? { kind: "requests", requests: [] };
      },
      otherDocumentsOfSale: async (saleId, fiscalDocumentId) => {
        this.operations.push("otherDocumentsOfSale");
        return [
          ...(this.saleDocuments.get(saleId) ?? []),
          ...this.requestsOfSale(saleId, fiscalDocumentId),
        ];
      },
      creditNotesOfSale: async (saleId) => {
        this.operations.push("creditNotesOfSale");
        return [
          ...(this.creditNotes.get(saleId) ?? []),
          ...creditNotesDecidedFor(saleId, this.regularizations),
        ];
      },
      recordOrphanRegularization: async (regularization) => {
        this.operations.push("recordOrphanRegularization");
        this.regularizations.push(regularization);
      },
    };
  }
}
