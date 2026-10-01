import { argentinaCalendarDay, type BuyerIdentificationThreshold } from "@purosur/domain";
import { useQueryClient } from "@tanstack/react-query";
import { useSendToMyAccount } from "../access/send-to-my-account";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { fetchCloudQuery, useCloudQuery } from "../platform/use-cloud-query";
import type { fetchBuyerIdentificationThresholds } from "./buyer-identification-threshold-api";
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

export type BuyerIdentificationThresholdsOnDay = {
  thresholds: BuyerIdentificationThreshold[];
  today: string;
};

export function readBuyerIdentificationThresholdsOnDay(
  fetchThresholds: typeof fetchBuyerIdentificationThresholds,
  now: () => Date,
): () => Promise<CloudReadOutcome<BuyerIdentificationThresholdsOnDay>> {
  return async () => {
    const outcome = await fetchThresholds();
    return outcome.kind === "ok"
      ? {
          kind: "ok",
          value: { thresholds: outcome.value, today: argentinaCalendarDay(now()) },
        }
      : outcome;
  };
}

export function useBuyerIdentificationThresholdsQuery(params: {
  fetchBuyerIdentificationThresholds: typeof fetchBuyerIdentificationThresholds;
  now: () => Date;
  onSessionEnded: () => void;
}) {
  const sendToMyAccount = useSendToMyAccount();
  return useCloudQuery<BuyerIdentificationThresholdsOnDay>({
    queryKey: fiscalKeys.buyerIdentificationThresholds,
    read: readBuyerIdentificationThresholdsOnDay(
      params.fetchBuyerIdentificationThresholds,
      params.now,
    ),
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToMyAccount,
  });
}

export function useReloadBuyerIdentificationThresholds(params: {
  fetchBuyerIdentificationThresholds: typeof fetchBuyerIdentificationThresholds;
  now: () => Date;
}): () => Promise<CloudReadOutcome<BuyerIdentificationThreshold[]>> {
  const client = useQueryClient();
  return async () => {
    void client.invalidateQueries({ queryKey: fiscalKey });
    const outcome = await fetchCloudQuery(client, {
      queryKey: fiscalKeys.buyerIdentificationThresholds,
      read: readBuyerIdentificationThresholdsOnDay(
        params.fetchBuyerIdentificationThresholds,
        params.now,
      ),
    });
    return outcome.kind === "ok" ? { kind: "ok", value: outcome.value.thresholds } : outcome;
  };
}
