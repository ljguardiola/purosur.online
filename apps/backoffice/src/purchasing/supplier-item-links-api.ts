import {
  type SupplierItemLinkChoices,
  type SupplierItemLinkProposal,
  supplierItemLinkChoicesSchema,
  supplierItemLinkProposalSchema,
} from "@purosur/contracts";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { readCloudJson } from "../platform/read-cloud-json";

export type FetchSupplierItemLinkProposalOutcome = CloudReadOutcome<SupplierItemLinkProposal>;

export type FetchSupplierItemLinkChoicesOutcome = CloudReadOutcome<SupplierItemLinkChoices>;

export function fetchSupplierItemLinkProposal(
  listId: string,
  rowId: string,
): Promise<FetchSupplierItemLinkProposalOutcome> {
  return readCloudJson(
    `/api/supplier-price-lists/${listId}/rows/${rowId}/link-proposal`,
    supplierItemLinkProposalSchema,
  );
}

export function fetchSupplierItemLinkChoices(): Promise<FetchSupplierItemLinkChoicesOutcome> {
  return readCloudJson("/api/supplier-price-lists/link-choices", supplierItemLinkChoicesSchema);
}
