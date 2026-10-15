import {
  type FortnightPresentationBody,
  fortnightPresentationListSchema,
} from "@purosur/contracts";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { readCloudList } from "./fiscal-api-request";

export type FortnightPresentation = {
  registerId: string;
  pointOfSaleNumber: number;
  fortnight: { start: string; end: string };
  deadline: string;
  documentType: FortnightPresentationBody["document_type"];
  documentCount: number;
  rejectedDocument: FortnightPresentationBody["rejected_document"];
  state: FortnightPresentationBody["state"];
};

export type FetchFortnightPresentationsOutcome = CloudReadOutcome<FortnightPresentation[]>;

function fortnightPresentationFromWire(row: FortnightPresentationBody): FortnightPresentation {
  return {
    registerId: row.register_id,
    pointOfSaleNumber: row.point_of_sale_number,
    fortnight: { start: row.fortnight_start, end: row.fortnight_end },
    deadline: row.deadline,
    documentType: row.document_type,
    documentCount: row.document_count,
    rejectedDocument: row.rejected_document,
    state: row.state,
  };
}

export function fetchFortnightPresentations(): Promise<FetchFortnightPresentationsOutcome> {
  return readCloudList("/api/registers/fortnight-presentations", (body) =>
    fortnightPresentationListSchema.safeParse(body).data?.map(fortnightPresentationFromWire),
  );
}
