import { useQueryClient } from "@tanstack/react-query";
import { useSendToMyAccount } from "../access/send-to-my-account";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { fetchCloudQuery, useCloudQuery } from "../platform/use-cloud-query";
import type { fetchIssuerIdentification, IssuerIdentification } from "./issuer-identification-api";

export const fiscalKey = ["fiscal"] as const;

export const fiscalKeys = {
  issuerIdentification: [...fiscalKey, "issuer-identification"] as const,
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
