import { useQueryClient } from "@tanstack/react-query";
import { useSendToMyAccount } from "../access/send-to-my-account";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { fetchCloudQuery, useCloudQuery } from "../platform/use-cloud-query";
import type {
  BuyerIdentificationThresholds,
  fetchBuyerIdentificationThresholds,
} from "./buyer-identification-threshold-api";
import type { fetchIssuerIdentification, IssuerIdentification } from "./issuer-identification-api";

export const fiscalKey = ["fiscal"] as const;

export const fiscalKeys = {
  issuerIdentification: [...fiscalKey, "issuer-identification"] as const,
  buyerIdentificationThresholds: [...fiscalKey, "buyer-identification-thresholds"] as const,
};

export function useIssuerIdentificationQuery(params: {
  fetchIssuerIdentification: typeof fetchIssuerIdentification;
  onSessionEnded: () => void;
}) {
  const sendToMyAccount = useSendToMyAccount();
  return useCloudQuery<IssuerIdentification>({
    queryKey: fiscalKeys.issuerIdentification,
    read: params.fetchIssuerIdentification,
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToMyAccount,
  });
}

export function useReloadIssuerIdentification(params: {
  fetchIssuerIdentification: typeof fetchIssuerIdentification;
}): () => Promise<CloudReadOutcome<IssuerIdentification>> {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: fiscalKey });
    return fetchCloudQuery(client, {
      queryKey: fiscalKeys.issuerIdentification,
      read: params.fetchIssuerIdentification,
    });
  };
}

export function useBuyerIdentificationThresholdsQuery(params: {
  fetchBuyerIdentificationThresholds: typeof fetchBuyerIdentificationThresholds;
  onSessionEnded: () => void;
}) {
  const sendToMyAccount = useSendToMyAccount();
  return useCloudQuery<BuyerIdentificationThresholds>({
    queryKey: fiscalKeys.buyerIdentificationThresholds,
    read: params.fetchBuyerIdentificationThresholds,
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToMyAccount,
  });
}

export function useReloadBuyerIdentificationThresholds(params: {
  fetchBuyerIdentificationThresholds: typeof fetchBuyerIdentificationThresholds;
}): () => Promise<CloudReadOutcome<BuyerIdentificationThresholds>> {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: fiscalKey });
    return fetchCloudQuery(client, {
      queryKey: fiscalKeys.buyerIdentificationThresholds,
      read: params.fetchBuyerIdentificationThresholds,
    });
  };
}
